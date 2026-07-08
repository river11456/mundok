#!/usr/bin/env python3
"""文讀 dev server — static files from dist/ + 문헌 JSON CRUD API + live reload

콘텐츠 단일 진실: src/data/<문헌>.json (DocJSON).
저작 API는 이 JSON 파일을 직접 수정한다. vite build --watch 가 변경을 감지해
재빌드 → 브라우저 자동 리로드. (구 userdata.json 델타 계층은 폐기됨)
"""
import http.server, socketserver, json, os, subprocess, threading, shutil

PORT = 19234
BASE = os.path.dirname(os.path.abspath(__file__))
VITE_BIN = 'vite.cmd' if os.name == 'nt' else 'vite'
VITE = os.path.join(BASE, 'node_modules', '.bin', VITE_BIN)
DATA_DIR = os.path.join(BASE, 'src', 'data')
doc_lock = threading.Lock()

LEVEL_ORDER = ['char', 'word', 'sentence', 'paragraph']
ID_PREFIX   = {'char': 'c', 'word': 'w', 'sentence': 's', 'paragraph': 'p'}


def doc_path(doc_id):
    return os.path.join(DATA_DIR, doc_id + '.json')


def load_doc(doc_id):
    with open(doc_path(doc_id), 'r', encoding='utf-8') as f:
        return json.load(f)


def save_doc(doc_id, data):
    """원자적 기록. migrate 스크립트와 동일하게 2-space indent + trailing newline."""
    tmp = doc_path(doc_id) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, doc_path(doc_id))


def next_id(cards, ctype):
    """해당 레벨에서 사용되지 않은 다음 안정 id (예: 마지막 s12 → s13)."""
    prefix = ID_PREFIX[ctype]
    mx = 0
    for c in cards:
        cid = c.get('id', '')
        if cid.startswith(prefix):
            try:
                mx = max(mx, int(cid[len(prefix):]))
            except ValueError:
                pass
    return f'{prefix}{mx + 1}'


def ensure_level(doc, ctype):
    """levels 에 ctype 배열을 보장하고, LEVEL_ORDER 순서를 유지한다."""
    levels = doc['levels']
    if ctype not in levels:
        levels[ctype] = []
        doc['levels'] = {k: levels[k] for k in LEVEL_ORDER if k in levels}
    return doc['levels'][ctype]


build_version = 1
build_lock = threading.Lock()

RELOAD_SCRIPT = b'''<script>
(function(){
  var v=null;
  window.__hanjaSkipReloads=0;
  setInterval(function(){
    fetch('/api/version').then(function(r){return r.json();}).then(function(d){
      if(v===null){v=d.v;return;}
      if(d.v!==v){
        if(window.__hanjaSkipReloads>0){window.__hanjaSkipReloads--;v=d.v;return;}
        location.reload();
      }
    }).catch(function(){});
  }, 800);
})();
</script>'''


def start_watcher():
    global build_version
    proc = subprocess.Popen(
        [VITE, 'build', '--watch'],
        cwd=BASE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )
    first = True
    for line in proc.stdout:
        if 'built in' in line:
            if first:
                first = False  # 워처 자체 초기 빌드는 건너뜀
                continue
            with build_lock:
                build_version += 1
            print(f'[live-reload] 빌드 완료 → v{build_version}', flush=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.join(BASE, 'dist'), **kwargs)

    def log_message(self, *_):
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/version':
            with build_lock:
                v = build_version
            self._json(200, {'v': v})
            return
        if self.path in ('/', '/index.html'):
            self._serve_html()
            return
        super().do_GET()

    def _serve_html(self):
        html_path = os.path.join(BASE, 'dist', 'index.html')
        try:
            with open(html_path, 'rb') as f:
                content = f.read()
            content = content.replace(b'</body>', RELOAD_SCRIPT + b'</body>', 1)
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except FileNotFoundError:
            self.send_error(404)

    def do_POST(self):
        if self.path == '/api/add-card':
            self._add_card()
        elif self.path == '/api/delete-card':
            self._delete_card()
        elif self.path == '/api/edit-card':
            self._edit_card()
        elif self.path == '/api/save-grammar':
            self._save_grammar()
        else:
            self.send_error(404)

    def _body(self):
        return json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))

    def _add_card(self):
        try:
            body  = self._body()
            doc_id = body['docId']
            ctype  = body['type']
            front  = body['front'].strip()
            if not front:
                raise ValueError('한자가 비어 있습니다')
            if ctype not in LEVEL_ORDER:
                raise ValueError(f'알 수 없는 레벨: {ctype}')
            with doc_lock:
                doc      = load_doc(doc_id)
                cards    = ensure_level(doc, ctype)
                existing = next((c for c in cards if c['text'] == front), None)
                if existing is not None:
                    new_id = existing['id']
                else:
                    new_id = next_id(cards, ctype)
                    cards.append({
                        'id':      new_id,
                        'text':    front,
                        'reading': body.get('reading', '').strip(),
                        'meaning': body.get('back', '').strip(),
                        'note':    body.get('note', '').strip(),
                    })
                    save_doc(doc_id, doc)
            self._json(200, {'ok': True, 'id': new_id})
        except Exception as e:
            self._json(500, {'ok': False, 'error': str(e)})

    def _delete_card(self):
        try:
            body    = self._body()
            doc_id  = body['docId']
            ctype   = body['type']
            card_id = body['id']
            with doc_lock:
                doc   = load_doc(doc_id)
                cards = doc['levels'].get(ctype, [])
                kept  = [c for c in cards if c.get('id') != card_id]
                found = len(kept) != len(cards)
                if found:
                    doc['levels'][ctype] = kept
                    save_doc(doc_id, doc)
            if found:
                self._json(200, {'ok': True})
            else:
                self._json(404, {'ok': False, 'error': '카드를 찾을 수 없습니다'})
        except Exception as e:
            self._json(500, {'ok': False, 'error': str(e)})

    def _edit_card(self):
        try:
            body    = self._body()
            doc_id  = body['docId']
            ctype   = body['type']
            card_id = body['id']
            text    = body['text'].strip()
            if not text:
                raise ValueError('한자가 비어 있습니다')
            with doc_lock:
                doc    = load_doc(doc_id)
                target = next((c for c in doc['levels'].get(ctype, []) if c.get('id') == card_id), None)
                if target is not None:
                    # 카드 내장 grammar 는 보존된다(텍스트 변경에도 끊기지 않음)
                    target['text']    = text
                    target['reading'] = body.get('reading', '').strip()
                    target['meaning'] = body.get('back', '').strip()
                    target['note']    = body.get('note', '').strip()
                    save_doc(doc_id, doc)
            if target is not None:
                self._json(200, {'ok': True})
            else:
                self._json(404, {'ok': False, 'error': '카드를 찾을 수 없습니다'})
        except Exception as e:
            self._json(500, {'ok': False, 'error': str(e)})

    def _save_grammar(self):
        try:
            body        = self._body()
            doc_id      = body['docId']
            card_id     = body['id']
            annotations = body.get('annotations', [])
            with doc_lock:
                doc    = load_doc(doc_id)
                target = next((c for c in doc['levels'].get('sentence', []) if c.get('id') == card_id), None)
                if target is not None:
                    if annotations:
                        target['grammar'] = annotations
                    else:
                        target.pop('grammar', None)
                    save_doc(doc_id, doc)
            if target is not None:
                self._json(200, {'ok': True})
            else:
                self._json(404, {'ok': False, 'error': '카드를 찾을 수 없습니다'})
        except Exception as e:
            self._json(500, {'ok': False, 'error': str(e)})

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# 초기 빌드 (npm이 있을 때만)
if shutil.which('npm'):
    print('文讀 초기 빌드 중...', flush=True)
    r = subprocess.run(['npm', 'run', 'build'], cwd=BASE)
    if r.returncode != 0:
        print('⚠ 빌드 실패 — 이전 dist/ 파일로 실행', flush=True)
else:
    print('文讀 (배포 모드) →  dist/ 사용', flush=True)

# 개발 모드(npm 있음)일 때만 라이브 리로드 워처 시작
if shutil.which('npm') and os.path.exists(VITE):
    threading.Thread(target=start_watcher, daemon=True).start()

socketserver.TCPServer.allow_reuse_address = True


def make_server():
    """19234를 우선 시도하고, 사용 중이면 OS가 빈 포트(0)를 배정한다."""
    try:
        return socketserver.TCPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        srv = socketserver.TCPServer(('127.0.0.1', 0), Handler)
        print(f'⚠ 포트 {PORT} 사용 중 — 빈 포트 {srv.server_address[1]}로 실행', flush=True)
        return srv


srv = make_server()
actual_port = srv.server_address[1]

# 런처(문독.command)가 실제 포트를 알 수 있도록 파일로 남긴다
port_file = os.path.join(BASE, '.runport')
try:
    with open(port_file, 'w') as f:
        f.write(str(actual_port))
except OSError:
    pass

print(f'文讀  →  http://localhost:{actual_port}', flush=True)
print('JSON(src/data) 수정 시 자동 빌드 + 브라우저 새로고침', flush=True)
try:
    with srv:
        srv.serve_forever()
finally:
    try:
        os.remove(port_file)
    except OSError:
        pass

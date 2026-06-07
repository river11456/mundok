#!/usr/bin/env python3
"""文讀 dev server — static files from dist/ + POST /api/add-card + live reload"""
import http.server, socketserver, json, os, subprocess, threading, time, shutil

PORT = 19234
BASE = os.path.dirname(os.path.abspath(__file__))
VITE = os.path.join(BASE, 'node_modules', '.bin', 'vite')
USERDATA_PATH = os.path.join(BASE, 'userdata.json')
userdata_lock = threading.Lock()


def load_userdata():
    try:
        with open(USERDATA_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {'additions': [], 'edits': [], 'deletions': []}


def save_userdata(data):
    tmp = USERDATA_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, USERDATA_PATH)

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
        if self.path == '/userdata.json':
            with userdata_lock:
                ud = load_userdata()
            body = json.dumps(ud, ensure_ascii=False, indent=2).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
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
        else:
            self.send_error(404)

    def _wait_rebuild(self):
        with build_lock:
            old_v = build_version
        deadline = time.time() + 30
        while time.time() < deadline:
            with build_lock:
                if build_version > old_v:
                    return
            time.sleep(0.2)
        raise TimeoutError('빌드 시간 초과 (30초)')

    def _add_card(self):
        try:
            body  = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            front = body['front'].strip()
            if not front:
                raise ValueError('한자가 비어 있습니다')
            with userdata_lock:
                ud = load_userdata()
                ud['additions'].append({
                    'docId':   body['docId'],
                    'type':    body['type'],
                    'text':    front,
                    'reading': body.get('reading', '').strip(),
                    'meaning': body.get('back', '').strip(),
                    'note':    body.get('note', '').strip(),
                })
                save_userdata(ud)
            self._json(200, {'ok': True})
        except Exception as e:
            self._json(500, {'ok': False, 'error': str(e)})

    def _delete_card(self):
        try:
            body  = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            docId = body['docId']
            ctype = body['type']
            front = body['front'].strip()
            with userdata_lock:
                ud     = load_userdata()
                before = len(ud['additions'])
                ud['additions'] = [a for a in ud['additions']
                                   if not (a['docId'] == docId and a['type'] == ctype and a['text'] == front)]
                if len(ud['additions']) == before:
                    # 기본 카드 → deletions에 추가 (중복 제거 후)
                    ud['deletions'] = [d for d in ud['deletions']
                                       if not (d['docId'] == docId and d['type'] == ctype and d['text'] == front)]
                    ud['deletions'].append({'docId': docId, 'type': ctype, 'text': front})
                save_userdata(ud)
            self._json(200, {'ok': True})
        except Exception as e:
            self._json(500, {'ok': False, 'error': str(e)})

    def _edit_card(self):
        try:
            body      = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            docId     = body['docId']
            ctype     = body['type']
            origFront = body['origFront'].strip()
            text      = body['text'].strip()
            reading   = body.get('reading', '').strip()
            back      = body.get('back', '').strip()
            note      = body.get('note', '').strip()
            if not text:
                raise ValueError('한자가 비어 있습니다')
            with userdata_lock:
                ud = load_userdata()
                in_additions = False
                for a in ud['additions']:
                    if a['docId'] == docId and a['type'] == ctype and a['text'] == origFront:
                        a.update({'text': text, 'reading': reading, 'meaning': back, 'note': note})
                        in_additions = True
                        break
                if not in_additions:
                    # 기본 카드 → edits에 추가 (중복 제거 후)
                    ud['edits'] = [e for e in ud['edits']
                                   if not (e['docId'] == docId and e['type'] == ctype and e['origText'] == origFront)]
                    ud['edits'].append({
                        'docId': docId, 'type': ctype, 'origText': origFront,
                        'text': text, 'reading': reading, 'meaning': back, 'note': note,
                    })
                save_userdata(ud)
            self._json(200, {'ok': True})
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
print(f'文讀  →  http://localhost:{PORT}', flush=True)
print('CSV 수정 시 자동 빌드 + 브라우저 새로고침', flush=True)
with socketserver.TCPServer(('', PORT), Handler) as srv:
    srv.serve_forever()

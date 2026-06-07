property PORT : 19234

on run
    set scriptFolder to do shell script "dirname " & quoted form of (POSIX path of (path to me as string))
    set serverScript to scriptFolder & "/server.py"
    set logDir to (POSIX path of (path to home folder)) & "Library/Logs/mundok"

    -- 서버가 이미 실행 중이면 건너뜀
    try
        do shell script "curl -sf http://localhost:" & PORT & "/api/version > /dev/null 2>&1"
    on error
        -- 서버 시작 후 응답까지 대기
        do shell script "mkdir -p " & quoted form of logDir & ¬
            " && nohup /usr/bin/python3 " & quoted form of serverScript & ¬
            " > " & quoted form of (logDir & "/server.log") & ¬
            " 2> " & quoted form of (logDir & "/server.error.log") & ¬
            " & for i in $(seq 1 100); do curl -sf http://localhost:" & PORT & ¬
            "/api/version > /dev/null 2>&1 && break; sleep 0.3; done"
    end try

    open location "http://localhost:" & PORT
end run

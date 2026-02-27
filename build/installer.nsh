; 구버전 자동 제거 스크립트
; 새 버전 설치 전에 기존 설치를 감지하고 자동으로 언인스톨

!macro customInit
  ; 현재 사용자(HKCU) 레지스트리에서 이전 설치 확인
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${If} $0 != ""
    ; 언인스톨러 경로에서 따옴표 제거
    StrCpy $1 $0 "" 1
    StrLen $2 $1
    IntOp $2 $2 - 1
    StrCpy $1 $1 $2

    ; 실행 중인 앱 종료 시도
    nsExec::ExecToLog 'taskkill /f /im virtual-company.exe'

    ; 구버전 사일런트 언인스톨 실행
    ExecWait '"$0" /S'

    ; 잠시 대기 (파일 삭제 완료 대기)
    Sleep 2000
  ${EndIf}

  ; 로컬 머신(HKLM)에서도 확인 (관리자 권한 설치된 경우)
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "UninstallString"
  ${If} $0 != ""
    nsExec::ExecToLog 'taskkill /f /im virtual-company.exe'
    ExecWait '"$0" /S'
    Sleep 2000
  ${EndIf}
!macroend

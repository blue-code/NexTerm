; 탐색기 우클릭 메뉴에 "NexTerm으로 열기" 등록/제거
; HKCU\Software\Classes를 사용 — 관리자 권한 없이 현재 사용자 범위로 등록된다
; (perMachine=false 기본 설치 방식과 일치, Windows가 HKCR 조회 시 자동으로 병합해 읽는다)

!macro customInstall
  ; 폴더 우클릭 (Directory)
  WriteRegStr HKCU "Software\Classes\Directory\shell\NexTerm" "" "NexTerm으로 열기"
  WriteRegStr HKCU "Software\Classes\Directory\shell\NexTerm" "Icon" "$INSTDIR\NexTerm.exe"
  WriteRegStr HKCU "Software\Classes\Directory\shell\NexTerm\command" "" '"$INSTDIR\NexTerm.exe" "%1"'

  ; 폴더 배경(빈 공간) 우클릭 (Directory\Background)
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NexTerm" "" "NexTerm으로 열기"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NexTerm" "Icon" "$INSTDIR\NexTerm.exe"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\NexTerm\command" "" '"$INSTDIR\NexTerm.exe" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\NexTerm"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\NexTerm"
!macroend

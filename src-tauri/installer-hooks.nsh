; Custom installer hooks for Slate.
;
; Registers Slate under HKCU\Software\Classes\Applications\<exe>, which is what
; makes it appear in Windows' "Open with" → "Choose another app" dialog for any
; file type — not just the extensions declared via fileAssociations.

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe" \
    "FriendlyAppName" "Slate"
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" \
    "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe\DefaultIcon" \
    "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\Applications\${MAINBINARYNAME}.exe"
!macroend

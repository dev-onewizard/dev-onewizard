!include "WordFunc.nsh"

!macro customInit
  Var /GLOBAL manualUpgrade
  StrCpy $manualUpgrade "0"

  ${If} ${isUpdated}
    # Older versions opened the updater without /S.
    SetSilent silent
  ${ElseIfNot} ${Silent}
    ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $0 == $INSTDIR
    ${AndIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${AndIf} ${FileExists} "$INSTDIR\resources\app.asar"
      ReadRegStr $0 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
      ${If} $0 != ""
        ${VersionCompare} "${VERSION}" "$0" $1
        ${If} $1 == 1
          StrCpy $manualUpgrade "1"
          SetSilent silent
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ${If} $manualUpgrade == "1"
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
  ${EndIf}
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Установка Codex Assistant"
  !define MUI_WELCOMEPAGE_TEXT "Выберите папку для установки Codex Assistant. Мастер добавит ярлыки на рабочий стол и в меню «Пуск»."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  Function UseCompletionArtwork
    Delete "$PLUGINSDIR\modern-wizard.bmp"
    File "/oname=$PLUGINSDIR\modern-wizard.bmp" "${BUILD_RESOURCES_DIR}\windows\finish.bmp"
  FunctionEnd

  Function LaunchCodexAssistant
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE UseCompletionArtwork
  !define MUI_FINISHPAGE_TITLE "Codex Assistant готов к запуску"
  !define MUI_FINISHPAGE_TEXT "Откройте приложение сейчас или запустите его позже с ярлыка."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Запустить Codex Assistant"
  !define MUI_FINISHPAGE_RUN_FUNCTION LaunchCodexAssistant
  !insertmacro MUI_PAGE_FINISH
!macroend

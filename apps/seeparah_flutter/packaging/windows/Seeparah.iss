; Seeparah native Windows installer for direct downloads and (once signed)
; optional Microsoft Store Win32 application submission.
; Build with ISCC.exe /DMyAppVersion=1.0.0 path\to\Seeparah.iss
; All Flutter build assets/DLLs must remain together; the generated .exe alone
; is not a usable installation package.
#ifndef MyAppVersion
  #error "Pass /DMyAppVersion=x.y.z to ISCC"
#endif
#define AppName "Seeparah"
#define AppExe "seeparah_reader.exe"

[Setup]
AppId={{A5FD4B97-1F54-5EAC-AC73-D0519446A14A}
AppName={#AppName}
AppVerName={#AppName} {#MyAppVersion}
AppVersion={#MyAppVersion}
AppPublisher=Seeparah
AppPublisherURL=https://seeparah.com
AppSupportURL=https://seeparah.com/legal#support
AppUpdatesURL=https://seeparah.com/download
DefaultDirName={localappdata}\Programs\Seeparah
DefaultGroupName=Seeparah
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#AppExe}
OutputDir=..\..\dist\windows
OutputBaseFilename=Seeparah-{#MyAppVersion}-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
CloseApplications=yes

[Files]
Source: "..\..\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Seeparah"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\Seeparah"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch Seeparah"; Flags: nowait postinstall skipifsilent

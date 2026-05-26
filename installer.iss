; Inno Setup Script for Excel Updater Tool
; SEE THE DOCUMENTATION FOR DETAILS ON CREATING INNO SETUP SCRIPT FILES!

#define MyAppName "卓越数据更新中心"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Your Company"
#define MyAppExeName "app.exe"

[Setup]
; AppId uniquely identifies this application.
AppId={{5A18C1D6-9876-4C54-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
; 默认打包到上层目录的 release 文件夹
OutputDir=..\release
OutputBaseFilename=卓越数据更新中心_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

; 安装前自动检测是否有同名进程在运行，强制要求关闭，防止覆盖失败
CloseApplications=yes
CloseApplicationsFilter=*.exe

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; 指向 PyInstaller 打包生成的单文件 app.exe
Source: "dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; 注意: 不要在共享系统文件中使用 "Flags: ignoreversion"

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
// 检测并静默杀掉进程（可选的高级处理，这里 CloseApplications=yes 已能处理大部分情况）

; Inno Setup Script for Excel Updater Tool
; SEE THE DOCUMENTATION FOR DETAILS ON CREATING INNO SETUP SCRIPT FILES!

#define MyAppName "教师信息更新工具"
#define MyAppVersion "1.0.9"
#define MyAppPublisher "运营"
#define MyAppExeName "app.exe"

[Setup]
; AppId uniquely identifies this application.
AppId={{5A18C1D6-9876-4C54-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
; 默认打包到外层目录
OutputDir=release
; 修改安装包的名字
OutputBaseFilename=教师信息更新工具_Setup
; 为安装程序本身添加图标 (确保 logo.ico 存在于同一目录下)
SetupIconFile=logo.ico
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
; 创建带有图标的快捷方式
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; IconFilename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  // 在安装包启动的第一秒，不管三七二十一，直接调用 Windows 底层命令强杀旧进程！
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /T /IM {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;
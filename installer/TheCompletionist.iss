; Installer for The Completionist (Inno Setup 6).
; Build: ISCC installer\TheCompletionist.iss /DAppVersion=2.0.0 /DSourceExe=<path to the published TheCompletionist.exe>
;   SourceExe = the framework-dependent build (dotnet publish --self-contained false), ~5 MB.
; Per-user install. Installs/checks the prerequisites:
;   - .NET 8 Desktop Runtime: downloaded from Microsoft and installed if missing (Windows asks for admin rights once)
;   - WebView2 Runtime (UI; preinstalled on Windows 11): downloaded and installed if missing

#ifndef AppVersion
  #define AppVersion "2.0.0"
#endif
#ifndef SourceExe
  #define SourceExe "..\publish\TheCompletionist.exe"
#endif

[Setup]
AppId={{6E8F3A52-7B1D-4C9E-9A41-2C5D7E0B9F13}
AppName=The Completionist
AppVersion={#AppVersion}
AppPublisher=Kloggzer
AppPublisherURL=https://github.com/Kloggzer/the-completionist-aion2
AppSupportURL=https://github.com/Kloggzer/the-completionist-aion2/issues
DefaultDirName={localappdata}\Programs\TheCompletionist
DefaultGroupName=The Completionist
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=TheCompletionist-Setup-{#AppVersion}
SetupIconFile=..\app.ico
UninstallDisplayIcon={app}\TheCompletionist.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
de.Prereq=Benötigte Komponenten von Microsoft werden geladen …
de.PrereqFailed=%1 konnte nicht installiert werden. Bitte später selbst installieren:%n%2
de.DesktopIcon=Desktop-Verknüpfung erstellen
en.Prereq=Downloading required components from Microsoft …
en.PrereqFailed=%1 could not be installed. Please install it yourself later:%n%2
en.DesktopIcon=Create a desktop shortcut

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; Flags: unchecked

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; DestName: "LICENSE.txt"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\The Completionist"; Filename: "{app}\TheCompletionist.exe"
Name: "{autodesktop}\The Completionist"; Filename: "{app}\TheCompletionist.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\TheCompletionist.exe"; Description: "{cm:LaunchProgram,The Completionist}"; Flags: nowait postinstall skipifsilent

; Left over by versions before 2.0 (tracking mode choice).
[InstallDelete]
Type: files; Name: "{app}\setup.json"

[UninstallDelete]
Type: files; Name: "{app}\setup.json"

[Code]
var
  DownloadPage: TDownloadWizardPage;

function DotNetInstalled: Boolean;
var
  Names: TFindRec;
begin
  // Any 8.x Microsoft.WindowsDesktop.App (the app targets net8.0-windows and rolls forward within 8.x).
  Result := FindFirst(ExpandConstant('{commonpf64}\dotnet\shared\Microsoft.WindowsDesktop.App\8.*'), Names);
  if Result then FindClose(Names);
end;

function WebView2Installed: Boolean;
var
  V: String;
begin
  // Evergreen runtime, per machine or per user (see Microsoft's WebView2 distribution docs).
  Result := (RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) and (V <> '') and (V <> '0.0.0.0'))
    or (RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) and (V <> '') and (V <> '0.0.0.0'))
    or (RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V) and (V <> '') and (V <> '0.0.0.0'));
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), CustomMessage('Prereq'), nil);
end;

// Run a downloaded Microsoft installer; ShellExec so that its own UAC prompt can appear (this setup runs without admin).
function RunInstaller(const Name, File, Params, Url: String): Boolean;
var
  Code: Integer;
begin
  Result := ShellExec('', ExpandConstant('{tmp}\') + File, Params, '', SW_SHOW, ewWaitUntilTerminated, Code) and ((Code = 0) or (Code = 3010));
  if not Result then MsgBox(FmtMessage(CustomMessage('PrereqFailed'), [Name, Url]), mbError, MB_OK);
end;

// Before installing: fetch and install what is missing (.NET 8 Desktop Runtime, WebView2).
function NextButtonClick(CurPageID: Integer): Boolean;
var
  NeedNet, NeedWv: Boolean;
begin
  Result := True;
  if CurPageID <> wpReady then exit;
  NeedNet := not DotNetInstalled;
  NeedWv := not WebView2Installed;
  if not (NeedNet or NeedWv) then exit;
  DownloadPage.Clear;
  if NeedNet then DownloadPage.Add('https://aka.ms/dotnet/8.0/windowsdesktop-runtime-win-x64.exe', 'windowsdesktop-runtime.exe', '');
  if NeedWv then DownloadPage.Add('https://go.microsoft.com/fwlink/p/?LinkId=2124703', 'MicrosoftEdgeWebview2Setup.exe', '');
  DownloadPage.Show;
  try
    try
      DownloadPage.Download;
      if NeedNet then RunInstaller('.NET 8 Desktop Runtime', 'windowsdesktop-runtime.exe', '/install /quiet /norestart', 'https://dotnet.microsoft.com/download/dotnet/8.0');
      if NeedWv then RunInstaller('WebView2 Runtime', 'MicrosoftEdgeWebview2Setup.exe', '/silent /install', 'https://developer.microsoft.com/microsoft-edge/webview2/');
    except
      if DownloadPage.AbortedByUser then Result := False
      else MsgBox(GetExceptionMessage, mbError, MB_OK);
    end;
  finally
    DownloadPage.Hide;
  end;
end;

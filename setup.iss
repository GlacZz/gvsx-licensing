; setup_gvsx.iss
; Inno Setup Script – Patch GVSX 26 (versão 1.0)

[Setup]
AppName=Patch GVSX 26
AppVersion=1.0
DefaultDirName={userdesktop}\Patch GVSX 26
DisableDirPage=no
DefaultGroupName=Patch GVSX 26
OutputDir=.
OutputBaseFilename=PatchGVSX26_Installer
Compression=lzma
SolidCompression=yes

[Files]
; Liste seus arquivos do mod aqui (ajuste o caminho)
Source: "modfiles\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{userdesktop}\Patch GVSX 26"; Filename: "{app}\launcher.exe"; WorkingDir: "{app}"

[Code]
const
  ServerURL = 'https://SEU_BACKEND.onrender.com/api/activate'; // Substitua pela URL Render

var
  RegPage: TInputQueryWizardPage;
  HWIDString: string;

function GetHWID(): string;
var
  bios, uuid: string;
  wmi, items: Variant;
begin
  try
    wmi := CreateOleObject('WbemScripting.SWbemLocator').ConnectServer('.', 'root\cimv2');
    items := wmi.ExecQuery('SELECT SerialNumber FROM Win32_BIOS');
    for Result in items do bios := Result.SerialNumber;
    items := wmi.ExecQuery('SELECT UUID FROM Win32_ComputerSystemProduct');
    for Result in items do uuid := Result.UUID;
    Result := bios + '-' + uuid;
  except
    Result := '{unknown}';
  end;
end;

procedure InitializeWizard();
begin
  HWIDString := GetHWID();
  RegPage := CreateInputQueryPage(wpSelectDir, 'Registrar GVSX', 'Validação de licença GVSX',
    'Informe seus dados de registro conforme enviados por e-mail.');
  RegPage.Add('Nome:', False);
  RegPage.Add('E-mail:', False);
  RegPage.Add('Serial de instalação:', False);
end;

function IsValidSerialFormat(s: string): Boolean;
var parts: TArrayOfString;
begin
  parts := SplitString(Trim(s), '-');
  Result := (GetArrayLength(parts) = 3) and (Length(parts[0]) = 6) and (Length(parts[1]) = 8) and (Length(parts[2]) = 7);
end;

function HttpPostJson(const Url, Body: string; var Response: string): Boolean;
var WinHttp: Variant;
begin
  Result := False;
  try
    WinHttp := CreateOleObject('WinHttp.WinHttpRequest.5.1');
    WinHttp.Open('POST', Url, False);
    WinHttp.SetRequestHeader('Content-Type', 'application/json');
    WinHttp.Send(Body);
    Response := WinHttp.ResponseText;
    Result := WinHttp.Status = 200;
  except
    Response := 'Erro de conexão';
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var name, email, serial, resp, body: string;
begin
  Result := True;
  if CurPageID = RegPage.ID then
  begin
    name := RegPage.Values[0];
    email := RegPage.Values[1];
    serial := RegPage.Values[2];

    if (name = '') or (email = '') or not IsValidSerialFormat(serial) then
    begin
      MsgBox('Preencha todos os campos corretamente. Serial deve estar no formato XXXXXX-XXXXXXXX-XXXXXXX.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    body := Format('{ "name":"%s","email":"%s","serial":"%s","hwid":"%s" }',
      [name, email, serial, HWIDString]);

    if HttpPostJson(ServerURL, body, resp) then
    begin
      if Pos('"status":"ok"', Lowercase(resp)) > 0 then
        MsgBox('Licença validada com sucesso! Instalando com licença vinculada a esta máquina.', mbInformation, MB_OK)
      else
      begin
        MsgBox('Falha na validação: ' + resp, mbError, MB_OK);
        Result := False;
      end;
    end
    else
    begin
      MsgBox('Erro ao conectar ao servidor: ' + resp, mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CreateModLog(const Folder, Serial: string);
var f, h: Integer; sub: TFindRec;
begin
  if FindFirst(AddBackslash(Folder) + '*', faAnyFile, sub) then
  begin
    try
      repeat
        if (sub.Name <> '.') and (sub.Name <> '..') and ((sub.Attributes and faDirectory) <> 0) then
          CreateModLog(AddBackslash(Folder) + sub.Name, Serial);
      until not FindNext(sub);
    finally
      FindClose(sub);
    end;
  end;

  f := FileCreate(AddBackslash(Folder) + 'modlog.md');
  if f >= 0 then
  begin
    FileWrite(f, 'Serial: ' + Serial + #13#10 + 'Instalado em: ' + DateTimeToStr(Now));
    FileClose(f);
    SetFileAttributes(AddBackslash(Folder) + 'modlog.md', FILE_ATTRIBUTE_HIDDEN or FILE_ATTRIBUTE_SYSTEM);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    CreateModLog(ExpandConstant('{app}'), RegPage.Values[2]);
end;
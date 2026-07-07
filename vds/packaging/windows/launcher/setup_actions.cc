#include <cwctype>
#include <filesystem>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include <windows.h>

#include <msiquery.h>

namespace {

std::wstring quote_command_argument(std::wstring_view value) {
  std::wstring result = L"\"";
  unsigned backslash_count = 0;
  for (const wchar_t ch : value) {
    if (ch == L'\\') {
      ++backslash_count;
      continue;
    }
    if (ch == L'"') {
      result.append(backslash_count * 2 + 1, L'\\');
      result.push_back(ch);
      backslash_count = 0;
      continue;
    }
    result.append(backslash_count, L'\\');
    backslash_count = 0;
    result.push_back(ch);
  }
  result.append(backslash_count * 2, L'\\');
  result.push_back(L'"');
  return result;
}

std::filesystem::path system_executable(const wchar_t *name) {
  std::vector<wchar_t> system_dir(MAX_PATH + 1);
  const UINT length = GetSystemDirectoryW(system_dir.data(),
                                          static_cast<UINT>(system_dir.size()));
  if (length == 0 || length >= system_dir.size()) {
    throw std::runtime_error("GetSystemDirectoryW failed");
  }

  std::filesystem::path path(system_dir.data());
  path /= name;
  return path;
}

int run_process(std::wstring command_line) {
  STARTUPINFOW startup_info{};
  startup_info.cb = sizeof(startup_info);
  startup_info.dwFlags = STARTF_USESHOWWINDOW;
  startup_info.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION process_info{};

  if (!CreateProcessW(nullptr, command_line.data(), nullptr, nullptr, FALSE,
                      CREATE_NO_WINDOW, nullptr, nullptr, &startup_info,
                      &process_info)) {
    return 1;
  }

  WaitForSingleObject(process_info.hProcess, INFINITE);
  DWORD exit_code = 1;
  GetExitCodeProcess(process_info.hProcess, &exit_code);

  CloseHandle(process_info.hThread);
  CloseHandle(process_info.hProcess);
  return static_cast<int>(exit_code);
}

std::string run_process_capture_output(std::wstring command_line) {
  SECURITY_ATTRIBUTES security_attributes{};
  security_attributes.nLength = sizeof(security_attributes);
  security_attributes.bInheritHandle = TRUE;

  HANDLE read_pipe = nullptr;
  HANDLE write_pipe = nullptr;
  if (!CreatePipe(&read_pipe, &write_pipe, &security_attributes, 0)) {
    return {};
  }
  SetHandleInformation(read_pipe, HANDLE_FLAG_INHERIT, 0);

  STARTUPINFOW startup_info{};
  startup_info.cb = sizeof(startup_info);
  startup_info.dwFlags = STARTF_USESHOWWINDOW | STARTF_USESTDHANDLES;
  startup_info.wShowWindow = SW_HIDE;
  startup_info.hStdOutput = write_pipe;
  startup_info.hStdError = write_pipe;

  PROCESS_INFORMATION process_info{};
  if (!CreateProcessW(nullptr, command_line.data(), nullptr, nullptr, TRUE,
                      CREATE_NO_WINDOW, nullptr, nullptr, &startup_info,
                      &process_info)) {
    CloseHandle(read_pipe);
    CloseHandle(write_pipe);
    return {};
  }

  CloseHandle(write_pipe);

  std::string output;
  char buffer[4096];
  DWORD bytes_read = 0;
  while (ReadFile(read_pipe, buffer, sizeof(buffer), &bytes_read, nullptr) &&
         bytes_read != 0) {
    output.append(buffer, buffer + bytes_read);
  }

  WaitForSingleObject(process_info.hProcess, INFINITE);
  CloseHandle(process_info.hThread);
  CloseHandle(process_info.hProcess);
  CloseHandle(read_pipe);
  return output;
}

std::wstring msi_property(MSIHANDLE install, const wchar_t *name) {
  DWORD size = 0;
  UINT status = MsiGetPropertyW(install, name, L"", &size);
  if (status != ERROR_MORE_DATA && status != ERROR_SUCCESS) {
    return {};
  }

  std::wstring value(size, L'\0');
  ++size;
  value.resize(size);
  status = MsiGetPropertyW(install, name, value.data(), &size);
  if (status != ERROR_SUCCESS) {
    return {};
  }
  value.resize(size);
  return value;
}

std::wstring lowercase_ascii(std::wstring value) {
  for (wchar_t &ch : value) {
    if (ch >= L'A' && ch <= L'Z') {
      ch = static_cast<wchar_t>(std::towlower(ch));
    }
  }
  return value;
}

std::string lowercase_ascii(std::string value) {
  for (char &ch : value) {
    if (ch >= 'A' && ch <= 'Z') {
      ch = static_cast<char>(ch - 'A' + 'a');
    }
  }
  return value;
}

bool test_signing_enabled() {
  std::wstring command_line =
      quote_command_argument(system_executable(L"bcdedit.exe").wstring());
  command_line += L" /enum {current}";

  std::istringstream stream(
      lowercase_ascii(run_process_capture_output(std::move(command_line))));
  std::string line;
  while (std::getline(stream, line)) {
    if (line.find("testsigning") != std::string::npos &&
        line.find("yes") != std::string::npos) {
      return true;
    }
  }
  return false;
}

std::filesystem::path program_data_path() {
  std::vector<wchar_t> program_data(MAX_PATH + 1);
  const DWORD length =
      GetEnvironmentVariableW(L"ProgramData", program_data.data(),
                              static_cast<DWORD>(program_data.size()));
  if (length == 0 || length >= program_data.size()) {
    throw std::runtime_error("ProgramData is not available");
  }

  return std::filesystem::path(program_data.data());
}

std::filesystem::path program_files_path() {
  std::vector<wchar_t> program_files(MAX_PATH + 1);
  DWORD length =
      GetEnvironmentVariableW(L"ProgramW6432", program_files.data(),
                              static_cast<DWORD>(program_files.size()));
  if (length == 0) {
    length = GetEnvironmentVariableW(L"ProgramFiles", program_files.data(),
                                     static_cast<DWORD>(program_files.size()));
  }
  if (length == 0 || length >= program_files.size()) {
    throw std::runtime_error("Program Files is not available");
  }

  return std::filesystem::path(program_files.data());
}

std::filesystem::path temp_path() {
  std::vector<wchar_t> temp_path(MAX_PATH + 1);
  const DWORD length =
      GetTempPathW(static_cast<DWORD>(temp_path.size()), temp_path.data());
  if (length == 0 || length >= temp_path.size()) {
    throw std::runtime_error("GetTempPathW failed");
  }

  return std::filesystem::path(temp_path.data());
}

std::filesystem::path installer_cache_dir() {
  std::filesystem::path path = temp_path();
  path /= L"vDSSetup";
  return path;
}

std::filesystem::path installer_cache_path() {
  std::filesystem::path path = installer_cache_dir();
  path /= L"vDSSetup.exe";
  return path;
}

std::filesystem::path prepare_installer_cache_path() {
  std::filesystem::create_directories(installer_cache_dir());
  return installer_cache_path();
}

void delete_resume_task() {
  std::wstring command_line =
      quote_command_argument(system_executable(L"schtasks.exe").wstring());
  command_line += L" /Delete /TN ";
  command_line += quote_command_argument(L"vDS Setup Resume");
  command_line += L" /F";
  run_process(std::move(command_line));
}

void delete_resume_cache() {
  try {
    std::error_code ignored;
    std::filesystem::remove(installer_cache_path(), ignored);
    std::filesystem::remove(installer_cache_dir(), ignored);
  } catch (...) {
  }
}

bool launched_from_resume_cache(MSIHANDLE install) {
  const std::wstring source = msi_property(install, L"VDS_SETUP_SOURCE");
  if (source.empty()) {
    return false;
  }

  try {
    const std::wstring source_path = lowercase_ascii(
        std::filesystem::path(source).lexically_normal().wstring());
    const std::wstring cache_path =
        lowercase_ascii(installer_cache_path().lexically_normal().wstring());
    return source_path == cache_path;
  } catch (...) {
    return false;
  }
}

void create_resume_task(const std::filesystem::path &cached_installer) {
  std::wstring task_command = L"\"" + cached_installer.wstring() + L"\"";
  std::wstring command_line =
      quote_command_argument(system_executable(L"schtasks.exe").wstring());
  command_line += L" /Create /TN ";
  command_line += quote_command_argument(L"vDS Setup Resume");
  command_line += L" /SC ONLOGON /RL HIGHEST /TR ";
  command_line += quote_command_argument(task_command);
  command_line += L" /F";

  if (run_process(std::move(command_line)) != 0) {
    throw std::runtime_error("failed to create resume scheduled task");
  }
}

void enable_test_signing() {
  std::wstring command_line =
      quote_command_argument(system_executable(L"bcdedit.exe").wstring());
  command_line += L" /set testsigning on";

  if (run_process(std::move(command_line)) != 0) {
    throw std::runtime_error("failed to enable Windows test signing");
  }
}

void reboot_now() {
  std::wstring command_line =
      quote_command_argument(system_executable(L"shutdown.exe").wstring());
  command_line += L" /r /t 0";
  run_process(std::move(command_line));
}

void delete_hklm_vds_setup_value(const wchar_t *name) {
  HKEY setup_key = nullptr;
  if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"Software\\vDS\\Setup", 0,
                    KEY_SET_VALUE, &setup_key) != ERROR_SUCCESS) {
    return;
  }
  RegDeleteValueW(setup_key, name);
  RegCloseKey(setup_key);
}

void set_registry_string(HKEY key, const wchar_t *name,
                         const std::wstring &value) {
  const DWORD byte_count =
      static_cast<DWORD>((value.size() + 1) * sizeof(wchar_t));
  RegSetValueExW(key, name, 0, REG_SZ,
                 reinterpret_cast<const BYTE *>(value.data()), byte_count);
}

void set_registry_dword(HKEY key, const wchar_t *name, DWORD value) {
  RegSetValueExW(key, name, 0, REG_DWORD,
                 reinterpret_cast<const BYTE *>(&value), sizeof(value));
}

std::wstring cache_setup_launcher(MSIHANDLE install) {
  const std::wstring source = msi_property(install, L"VDS_SETUP_SOURCE");
  if (source.empty() || !std::filesystem::exists(source)) {
    return {};
  }

  const std::filesystem::path cached_installer = prepare_installer_cache_path();
  std::filesystem::copy_file(source, cached_installer,
                             std::filesystem::copy_options::overwrite_existing);
  return cached_installer.wstring();
}

void update_control_panel_entry(MSIHANDLE install,
                                const std::wstring &cached_installer) {
  if (cached_installer.empty()) {
    return;
  }

  HKEY uninstall_key = nullptr;
  if (RegCreateKeyExW(HKEY_LOCAL_MACHINE,
                      L"Software\\Microsoft\\Windows\\CurrentVersion\\"
                      L"Uninstall\\vDS",
                      0, nullptr, 0, KEY_SET_VALUE | KEY_WOW64_64KEY, nullptr,
                      &uninstall_key, nullptr) != ERROR_SUCCESS) {
    return;
  }

  const std::wstring install_folder = msi_property(install, L"INSTALLFOLDER");
  const std::wstring display_version =
      msi_property(install, L"VDS_DISPLAY_VERSION");
  const std::wstring uninstall_string =
      quote_command_argument(cached_installer) + L" --uninstall";

  set_registry_string(uninstall_key, L"DisplayName", L"vDS");
  set_registry_string(uninstall_key, L"DisplayVersion", display_version);
  set_registry_string(uninstall_key, L"DisplayIcon", cached_installer);
  set_registry_string(uninstall_key, L"InstallLocation", install_folder);
  set_registry_string(uninstall_key, L"Publisher", L"Jihong Min");
  set_registry_string(uninstall_key, L"UninstallString", uninstall_string);
  set_registry_dword(uninstall_key, L"NoModify", 1);
  set_registry_dword(uninstall_key, L"NoRepair", 1);

  RegCloseKey(uninstall_key);
}

void delete_control_panel_entry(REGSAM registry_view) {
  HKEY uninstall_root = nullptr;
  if (RegOpenKeyExW(HKEY_LOCAL_MACHINE,
                    L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
                    0, KEY_WRITE | registry_view,
                    &uninstall_root) != ERROR_SUCCESS) {
    return;
  }
  RegDeleteTreeW(uninstall_root, L"vDS");
  RegCloseKey(uninstall_root);
}

void remove_userspace_files(const std::filesystem::path &path) {
  if (path.empty()) {
    return;
  }

  std::error_code ignored;
  std::filesystem::remove(path / L"vdsd.exe", ignored);
  std::filesystem::remove(path / L"vdsctl.exe", ignored);
  std::filesystem::remove(path / L"opus.dll", ignored);
  std::filesystem::remove(path, ignored);
}

} // namespace

extern "C" __declspec(dllexport) UINT __stdcall
CheckTestSigning(MSIHANDLE install) {
  const bool enabled = test_signing_enabled();
  const bool resumed = launched_from_resume_cache(install);
  MsiSetPropertyW(install, L"VDS_TESTSIGNING_ENABLED", enabled ? L"1" : L"0");
  MsiSetPropertyW(install, L"VDS_TESTSIGNING_RESUME_FAILED",
                  (!enabled && resumed) ? L"1" : L"0");
  if (enabled || resumed) {
    delete_resume_task();
    delete_resume_cache();
  }
  return ERROR_SUCCESS;
}

extern "C" __declspec(dllexport) UINT __stdcall
EnableTestSigningAndReboot(MSIHANDLE install) {
  try {
    delete_resume_task();
    delete_resume_cache();
    enable_test_signing();

    const std::wstring source = msi_property(install, L"VDS_SETUP_SOURCE");
    if (!source.empty() && std::filesystem::exists(source)) {
      const std::filesystem::path cached_installer =
          prepare_installer_cache_path();
      std::filesystem::copy_file(
          source, cached_installer,
          std::filesystem::copy_options::overwrite_existing);
      create_resume_task(cached_installer);
    }

    reboot_now();
    return ERROR_SUCCESS;
  } catch (...) {
    delete_resume_task();
    delete_resume_cache();
    return ERROR_INSTALL_FAILURE;
  }
}

extern "C" __declspec(dllexport) UINT __stdcall
PromptRebootAfterUninstall(MSIHANDLE) {
  const int choice = MessageBoxW(
      nullptr,
      L"vDS has been removed from this computer.\n\n"
      L"A Windows reboot is recommended before reinstalling vDS or using "
      L"Bluetooth controller devices normally.\n\n"
      L"Reboot now?",
      L"vDS Setup", MB_YESNO | MB_ICONINFORMATION | MB_DEFBUTTON2);
  if (choice == IDYES) {
    reboot_now();
  }
  return ERROR_SUCCESS;
}

extern "C" __declspec(dllexport) UINT __stdcall
UpdateDisplayVersion(MSIHANDLE install) {
  const std::wstring cached_installer = cache_setup_launcher(install);
  update_control_panel_entry(install, cached_installer);
  return ERROR_SUCCESS;
}

extern "C" __declspec(dllexport) UINT __stdcall ClearPathMarker(MSIHANDLE) {
  delete_hklm_vds_setup_value(L"PathEntry");
  return ERROR_SUCCESS;
}

extern "C" __declspec(dllexport) UINT __stdcall ClearFilterMarker(MSIHANDLE) {
  delete_hklm_vds_setup_value(L"FilterDriver");
  return ERROR_SUCCESS;
}

extern "C" __declspec(dllexport) UINT __stdcall
RemoveProgramData(MSIHANDLE install) {
  if (msi_property(install, L"CustomActionData") != L"1") {
    return ERROR_SUCCESS;
  }

  try {
    std::error_code ignored;
    std::filesystem::remove_all(program_data_path() / L"vDS", ignored);
  } catch (...) {
  }
  return ERROR_SUCCESS;
}

extern "C" __declspec(dllexport) UINT __stdcall
RemoveInstallDirectories(MSIHANDLE install) {
  try {
    remove_userspace_files(
        std::filesystem::path(msi_property(install, L"CustomActionData")));
    remove_userspace_files(program_files_path() / L"vDS");
  } catch (...) {
  }
  return ERROR_SUCCESS;
}

extern "C" __declspec(dllexport) UINT __stdcall RemoveVdsRegistry(MSIHANDLE) {
  delete_control_panel_entry(KEY_WOW64_64KEY);
  delete_control_panel_entry(KEY_WOW64_32KEY);
  delete_control_panel_entry(0);

  HKEY software_key = nullptr;
  if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"Software", 0, KEY_WRITE,
                    &software_key) == ERROR_SUCCESS) {
    RegDeleteTreeW(software_key, L"vDS");
    RegCloseKey(software_key);
  }
  return ERROR_SUCCESS;
}

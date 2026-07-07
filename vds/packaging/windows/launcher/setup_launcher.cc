#include <cstdint>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#include <windows.h>

#include "setup_payload.hh"

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

std::filesystem::path current_executable_path() {
  std::vector<wchar_t> path(MAX_PATH);
  while (true) {
    const DWORD length = GetModuleFileNameW(nullptr, path.data(),
                                            static_cast<DWORD>(path.size()));
    if (length == 0) {
      throw std::runtime_error("GetModuleFileNameW failed");
    }
    if (length < path.size()) {
      path.resize(length);
      return std::filesystem::path(path.data());
    }
    path.resize(path.size() * 2);
  }
}

bool process_is_elevated() {
  HANDLE token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
    return false;
  }

  TOKEN_ELEVATION elevation{};
  DWORD bytes = 0;
  const BOOL ok = GetTokenInformation(token, TokenElevation, &elevation,
                                      sizeof(elevation), &bytes);
  CloseHandle(token);
  return ok && elevation.TokenIsElevated != 0;
}

void configure_process_ui() {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
}

int relaunch_elevated(bool uninstall) {
  const std::filesystem::path executable = current_executable_path();
  SHELLEXECUTEINFOW info{};
  info.cbSize = sizeof(info);
  info.fMask = SEE_MASK_NOCLOSEPROCESS;
  info.lpVerb = L"runas";
  info.lpFile = executable.c_str();
  info.lpParameters = uninstall ? L"--uninstall" : L"";
  info.nShow = SW_SHOWNORMAL;

  if (!ShellExecuteExW(&info)) {
    if (GetLastError() == ERROR_CANCELLED) {
      MessageBoxW(nullptr, L"Setup was canceled.", L"vDS Setup",
                  MB_OK | MB_ICONINFORMATION);
      return ERROR_CANCELLED;
    }
    MessageBoxW(nullptr, L"Failed to start elevated vDS setup.", L"vDS Setup",
                MB_OK | MB_ICONERROR);
    return 1;
  }

  WaitForSingleObject(info.hProcess, INFINITE);
  DWORD exit_code = 1;
  GetExitCodeProcess(info.hProcess, &exit_code);
  CloseHandle(info.hProcess);
  return static_cast<int>(exit_code);
}

std::filesystem::path setup_work_dir() {
  std::vector<wchar_t> temp_path(MAX_PATH + 1);
  const DWORD length =
      GetTempPathW(static_cast<DWORD>(temp_path.size()), temp_path.data());
  if (length == 0 || length >= temp_path.size()) {
    throw std::runtime_error("GetTempPathW failed");
  }

  std::filesystem::path path(temp_path.data());
  path /= L"vDSSetup";
  path /= L"payload-" + std::to_wstring(GetCurrentProcessId());
  std::filesystem::remove_all(path);
  std::filesystem::create_directories(path);
  return path;
}

void write_payloads(const std::filesystem::path &dir) {
  for (const auto &payload : kVdsSetupPayloads) {
    const std::filesystem::path path = dir / payload.file_name;
    std::ofstream stream(path, std::ios::binary);
    if (!stream) {
      throw std::runtime_error("failed to create setup payload");
    }
    stream.write(reinterpret_cast<const char *>(payload.data),
                 static_cast<std::streamsize>(payload.size));
    if (!stream) {
      throw std::runtime_error("failed to write setup payload");
    }
  }
}

int run_process(std::wstring command_line, int show_window) {
  STARTUPINFOW startup_info{};
  startup_info.cb = sizeof(startup_info);
  startup_info.dwFlags = STARTF_USESHOWWINDOW;
  startup_info.wShowWindow = static_cast<WORD>(show_window);
  PROCESS_INFORMATION process_info{};

  if (!CreateProcessW(nullptr, command_line.data(), nullptr, nullptr, FALSE, 0,
                      nullptr, nullptr, &startup_info, &process_info)) {
    return 1;
  }

  WaitForSingleObject(process_info.hProcess, INFINITE);
  DWORD exit_code = 1;
  if (!GetExitCodeProcess(process_info.hProcess, &exit_code)) {
    exit_code = 1;
  }

  CloseHandle(process_info.hThread);
  CloseHandle(process_info.hProcess);
  return static_cast<int>(exit_code);
}

void launch_process(std::wstring command_line, int show_window) {
  STARTUPINFOW startup_info{};
  startup_info.cb = sizeof(startup_info);
  startup_info.dwFlags = STARTF_USESHOWWINDOW;
  startup_info.wShowWindow = static_cast<WORD>(show_window);
  PROCESS_INFORMATION process_info{};

  if (CreateProcessW(nullptr, command_line.data(), nullptr, nullptr, FALSE, 0,
                     nullptr, nullptr, &startup_info, &process_info)) {
    CloseHandle(process_info.hThread);
    CloseHandle(process_info.hProcess);
  }
}

bool is_success_exit_code(int status) {
  return status == 0 || status == 3010 || status == 1641;
}

int run_main_msi(const std::filesystem::path &msi,
                 const std::filesystem::path &setup_source) {
  std::wstring command_line =
      quote_command_argument(system_executable(L"msiexec.exe").wstring());
  command_line += L" /i ";
  command_line += quote_command_argument(msi.wstring());
  command_line += L" VDS_SETUP_LAUNCHED=1 VDS_SETUP_SOURCE=";
  command_line += quote_command_argument(setup_source.wstring());
  command_line += L" /norestart";
  return run_process(std::move(command_line), SW_SHOWNORMAL);
}

int run_main_msi_uninstall(const std::filesystem::path &msi,
                           const std::filesystem::path &setup_source) {
  std::wstring command_line =
      quote_command_argument(system_executable(L"msiexec.exe").wstring());
  command_line += L" /i ";
  command_line += quote_command_argument(msi.wstring());
  command_line += L" REMOVE=ALL VDS_EXPLICIT_UNINSTALL=1 VDS_SETUP_LAUNCHED=1 "
                  L"VDS_SETUP_SOURCE=";
  command_line += quote_command_argument(setup_source.wstring());
  command_line += L" /norestart";
  return run_process(std::move(command_line), SW_SHOWNORMAL);
}

int run_driver_msi(const std::filesystem::path &msi) {
  std::wstring command_line =
      quote_command_argument(system_executable(L"msiexec.exe").wstring());
  command_line += L" /i ";
  command_line += quote_command_argument(msi.wstring());
  command_line += L" VDS_FORCE_DRIVER_INSTALL=1";
  command_line += L" /passive /norestart";
  return run_process(std::move(command_line), SW_SHOWNORMAL);
}

bool filter_driver_selected() {
  std::vector<wchar_t> value(64);
  DWORD bytes = static_cast<DWORD>(value.size() * sizeof(wchar_t));
  const LSTATUS status =
      RegGetValueW(HKEY_LOCAL_MACHINE, L"Software\\vDS\\Setup", L"FilterDriver",
                   RRF_RT_REG_SZ, nullptr, value.data(), &bytes);
  return status != ERROR_SUCCESS || std::wstring_view(value.data()) == L"1";
}

void reboot_now() {
  std::wstring command_line =
      quote_command_argument(system_executable(L"shutdown.exe").wstring());
  command_line += L" /r /t 0";
  run_process(std::move(command_line), SW_HIDE);
}

void remove_setup_cache_after_exit() {
  std::vector<wchar_t> temp_path(MAX_PATH + 1);
  const DWORD length =
      GetTempPathW(static_cast<DWORD>(temp_path.size()), temp_path.data());
  if (length == 0 || length >= temp_path.size()) {
    return;
  }

  std::filesystem::path cache_dir(temp_path.data());
  cache_dir /= L"vDSSetup";

  std::wstring command_line =
      quote_command_argument(system_executable(L"cmd.exe").wstring());
  command_line += L" /d /c ping -n 3 127.0.0.1 > nul & rmdir /s /q ";
  command_line += quote_command_argument(cache_dir.wstring());
  launch_process(std::move(command_line), SW_HIDE);
}

void prompt_reboot() {
  const int choice = MessageBoxW(
      nullptr,
      L"vDS setup has finished installing the selected components.\n\n"
      L"A Windows reboot is recommended before using vDS.\n\n"
      L"Reboot now?",
      L"vDS Setup", MB_YESNO | MB_ICONINFORMATION | MB_DEFBUTTON2);
  if (choice == IDYES) {
    reboot_now();
  }
}

void show_failed_status(const wchar_t *stage, int status) {
  std::wstring message = L"vDS setup failed while ";
  message += stage;
  message += L".\n\nExit code: ";
  message += std::to_wstring(status);
  MessageBoxW(nullptr, message.c_str(), L"vDS Setup", MB_OK | MB_ICONERROR);
}

} // namespace

extern "C" {
extern int __argc;
extern wchar_t **__wargv;
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
  configure_process_ui();

  bool uninstall = false;
  for (int index = 1; index < __argc; ++index) {
    if (std::wstring_view(__wargv[index]) == L"--uninstall") {
      uninstall = true;
    }
  }

  if (!process_is_elevated()) {
    return relaunch_elevated(uninstall);
  }

  std::filesystem::path work_dir;
  try {
    work_dir = setup_work_dir();
    write_payloads(work_dir);

    const std::filesystem::path main_msi = work_dir / L"vDS-setup.msi";
    const int main_status =
        uninstall ? run_main_msi_uninstall(main_msi, current_executable_path())
                  : run_main_msi(main_msi, current_executable_path());
    if (!is_success_exit_code(main_status)) {
      if (main_status != 1602) {
        show_failed_status(L"running the main installer", main_status);
      }
      std::filesystem::remove_all(work_dir);
      return main_status;
    }

    if (uninstall) {
      std::filesystem::remove_all(work_dir);
      remove_setup_cache_after_exit();
      return 0;
    }

    int driver_status = run_driver_msi(work_dir / L"vDS-usb-setup.msi");
    if (!is_success_exit_code(driver_status)) {
      show_failed_status(L"installing vds_usb.sys", driver_status);
      std::filesystem::remove_all(work_dir);
      return driver_status;
    }

    if (filter_driver_selected()) {
      driver_status = run_driver_msi(work_dir / L"vDS-filter-setup.msi");
      if (!is_success_exit_code(driver_status)) {
        show_failed_status(L"installing vds_filter.sys", driver_status);
        std::filesystem::remove_all(work_dir);
        return driver_status;
      }
    }

    prompt_reboot();
    std::filesystem::remove_all(work_dir);
    return 0;
  } catch (const std::exception &) {
    if (!work_dir.empty()) {
      std::error_code ignored;
      std::filesystem::remove_all(work_dir, ignored);
    }
    MessageBoxW(nullptr, L"vDS setup failed unexpectedly.", L"vDS Setup",
                MB_OK | MB_ICONERROR);
    return 1;
  }
}

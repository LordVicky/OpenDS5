#include <filesystem>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include <windows.h>

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

std::filesystem::path powershell_path() {
  std::vector<wchar_t> system_dir(MAX_PATH + 1);
  const UINT length = GetSystemDirectoryW(system_dir.data(),
                                          static_cast<UINT>(system_dir.size()));
  if (length == 0 || length >= system_dir.size()) {
    return L"powershell.exe";
  }

  std::filesystem::path path(system_dir.data());
  path /= L"WindowsPowerShell\\v1.0\\powershell.exe";
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
  if (!GetExitCodeProcess(process_info.hProcess, &exit_code)) {
    exit_code = 1;
  }

  CloseHandle(process_info.hThread);
  CloseHandle(process_info.hProcess);
  return static_cast<int>(exit_code);
}

bool is_success_exit_code(int status) {
  return status == 0 || status == 3010 || status == 1641;
}

int run_powershell_script(const std::filesystem::path &script,
                          const std::vector<std::wstring> &arguments) {
  std::wstring command_line =
      quote_command_argument(powershell_path().wstring());
  command_line +=
      L" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ";
  command_line += quote_command_argument(script.wstring());
  for (const auto &argument : arguments) {
    command_line.push_back(L' ');
    command_line += quote_command_argument(argument);
  }

  return run_process(std::move(command_line));
}

} // namespace

extern "C" {
extern int __argc;
extern wchar_t **__wargv;
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
  if (__argc != 4) {
    return 2;
  }

  const std::wstring_view action = __wargv[1];
  const std::wstring target = __wargv[2];
  const std::filesystem::path script = __wargv[3];

  int status = 1;
  if (action == L"install") {
    status = run_powershell_script(
        script, {L"-Target", target, L"-SkipRemovePrevious"});
  } else if (action == L"uninstall") {
    status = run_powershell_script(script, {L"-Target", target});
  } else {
    return 2;
  }

  return is_success_exit_code(status) ? 0 : status;
}

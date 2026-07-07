// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jihong Min <hurryman2212@gmail.com>
#pragma once

#include <fstream>
#include <mutex>
#include <string>
#include <string_view>

namespace vds {

#ifdef _WIN32
inline constexpr const char *kDefaultLogPath = R"(C:\ProgramData\vDS\vdsd.log)";
#else
inline constexpr const char *kDefaultLogPath = "/var/log/vdsd.log";
#endif

enum class LogLevel {
  Debug,
  Info,
  Warn,
  Error,
};

class Logger {
public:
  explicit Logger(const std::string &path);

  void log(std::string_view scope, LogLevel level, std::string_view message);

private:
  std::mutex mutex_;
  std::ofstream file_;
};

const char *log_level_name(LogLevel level);

} // namespace vds

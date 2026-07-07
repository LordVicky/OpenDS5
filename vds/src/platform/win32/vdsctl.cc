// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jihong Min <hurryman2212@gmail.com>

#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <array>
#include <stdexcept>
#include <string>

#include <windows.h>

#include "vds_build_info.hh"
#include "vds_win32.hh"
#include "vdsctl_common.hh"

namespace {

constexpr const char *kDefaultControlPipe = R"(\\.\pipe\vdsd)";

using vds::win::win32_error_message;

std::string request_daemon(const std::string &command) {
  std::array<char, 8192> buffer{};
  DWORD bytes_read = 0;
  if (CallNamedPipeA(kDefaultControlPipe, const_cast<char *>(command.data()),
                     static_cast<DWORD>(command.size()), buffer.data(),
                     static_cast<DWORD>(buffer.size()), &bytes_read, 2000)) {
    return std::string(buffer.data(), bytes_read);
  }

  throw std::runtime_error("failed to connect " +
                           std::string(kDefaultControlPipe) + ": " +
                           win32_error_message(GetLastError()));
}

} // namespace

int main(int argc, char **argv) {
  return vds::run_vdsctl_app(argc, argv, vds::kVersion, vds::kBuildYear,
                             vds::VdsctlPlatform{
                                 .request_control =
                                     [](const std::string &command) {
                                       return request_daemon(command);
                                     },
                             });
}

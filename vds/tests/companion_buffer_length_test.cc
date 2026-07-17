// Verifies SET_HAPTICS_BUFFER_LENGTH (0x0B) is stored in CompanionSettings
// through the control-request path (it was previously ack-and-ignore).
#include <cassert>
#include <cstdio>
#include <string>
#include <vector>

#include "jsonl.hh"
#include "vds_companion.hh"
#include "vds_log.hh"

namespace {

std::string command_request_json(std::uint16_t value) {
  std::vector<unsigned> report(vds::kCompanionReportLength, 0);
  report[0] = 0x02; // command report id
  report[1] = 'D';
  report[2] = 'S';
  report[3] = '5';
  report[4] = 'B';
  report[5] = vds::kCompanionProtocolMajor;
  report[6] = vds::kCompanionProtocolMinor;
  report[7] = 0x0B; // SET_HAPTICS_BUFFER_LENGTH
  report[8] = 1;    // sequence
  report[9] = value & 0xff;
  report[10] = (value >> 8) & 0xff;
  std::string json = "{\"command\":\"companion\",\"op\":\"write\",\"report\":[";
  for (std::size_t i = 0; i < report.size(); ++i) {
    if (i != 0) {
      json += ",";
    }
    json += std::to_string(report[i]);
  }
  json += "]}";
  return json;
}

void send_command(vds::CompanionRuntime &runtime, std::uint16_t value,
                  vds::Logger &logger) {
  const auto fields =
      vds::parse_jsonl_object(command_request_json(value), "test");
  vds::handle_companion_control_request(fields, runtime, "/dev/null", {},
                                        logger);
}

} // namespace

int main() {
  vds::Logger logger("/tmp/companion_buffer_length_test.log");
  vds::CompanionRuntime runtime;

  assert(runtime.settings.haptics_buffer_samples == 0);

  send_command(runtime, 115, logger);
  assert(runtime.last_result_code == 0); // kAckOk
  assert(runtime.settings.haptics_buffer_samples == 115);

  // Out-of-range values are rejected and do not clobber the stored value.
  send_command(runtime, 8, logger);
  assert(runtime.last_result_code != 0);
  assert(runtime.settings.haptics_buffer_samples == 115);

  send_command(runtime, 300, logger);
  assert(runtime.last_result_code != 0);
  assert(runtime.settings.haptics_buffer_samples == 115);

  send_command(runtime, 16, logger);
  assert(runtime.settings.haptics_buffer_samples == 16);
  send_command(runtime, 240, logger);
  assert(runtime.settings.haptics_buffer_samples == 240);

  std::puts("companion_buffer_length_test OK");
  return 0;
}

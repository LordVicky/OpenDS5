// SPDX-License-Identifier: AGPL-3.0-only
#include "vds_uhid.hh"

#include <cerrno>
#include <cstring>

#include <fcntl.h>
#include <linux/uhid.h>
#include <unistd.h>

#include "uapi/vds.h"
#include "vds/ds5_usb.h"
#include "vds_log.hh"

namespace vds {

namespace {

bool write_uhid_event(int fd, const uhid_event &event, Logger &logger,
                      const char *what) {
  const ssize_t wrote = ::write(fd, &event, sizeof(event));
  if (wrote != static_cast<ssize_t>(sizeof(event))) {
    logger.log("uhid", LogLevel::Warn,
               std::string(what) + " failed: " +
                   (wrote < 0 ? std::strerror(errno) : "short write"));
    return false;
  }
  return true;
}

} // namespace

bool UhidDevice::open(Logger &logger) {
  if (fd_) {
    return true;
  }
  fd_ = UniqueFd(::open("/dev/uhid", O_RDWR | O_NONBLOCK | O_CLOEXEC));
  if (!fd_) {
    logger.log("uhid", LogLevel::Error,
               std::string("failed to open /dev/uhid: ") +
                   std::strerror(errno));
    return false;
  }
  return true;
}

bool UhidDevice::create(std::uint32_t profile, Logger &logger) {
  if (!fd_ || created_) {
    return created_;
  }

  const bool edge = profile == VDS_PROFILE_DSE;
  const vds_u8 *descriptor =
      edge ? vds_dse_usb_hid_report_descriptor : vds_ds5_usb_hid_report_descriptor;
  const std::size_t descriptor_size =
      edge ? sizeof(vds_dse_usb_hid_report_descriptor)
           : sizeof(vds_ds5_usb_hid_report_descriptor);
  const char *product =
      edge ? VDS_DSE_USB_PRODUCT_STRING : VDS_DS5_USB_PRODUCT_STRING;

  uhid_event event{};
  event.type = UHID_CREATE2;
  std::snprintf(reinterpret_cast<char *>(event.u.create2.name),
                sizeof(event.u.create2.name), "%s %s",
                VDS_USB_MANUFACTURER_STRING, product);
  std::memcpy(event.u.create2.rd_data, descriptor, descriptor_size);
  event.u.create2.rd_size = static_cast<std::uint16_t>(descriptor_size);
  event.u.create2.bus = BUS_USB;
  event.u.create2.vendor = VDS_SONY_VENDOR_ID;
  event.u.create2.product = edge ? VDS_DSE_PRODUCT_ID : VDS_DS5_PRODUCT_ID;
  event.u.create2.version = VDS_USB_DEVICE_BCD;

  if (!write_uhid_event(fd_.get(), event, logger, "UHID_CREATE2")) {
    return false;
  }
  created_ = true;
  logger.log("uhid", LogLevel::Info,
             std::string("virtual HID device created: ") + product);
  return true;
}

void UhidDevice::destroy(Logger &logger) {
  if (!fd_ || !created_) {
    return;
  }
  uhid_event event{};
  event.type = UHID_DESTROY;
  (void)write_uhid_event(fd_.get(), event, logger, "UHID_DESTROY");
  created_ = false;
  logger.log("uhid", LogLevel::Info, "virtual HID device destroyed");
}

bool UhidDevice::send_input(std::span<const std::uint8_t> report,
                            Logger &logger) {
  if (!fd_ || !created_) {
    return false;
  }
  uhid_event event{};
  event.type = UHID_INPUT2;
  const std::size_t size =
      std::min(report.size(), sizeof(event.u.input2.data));
  std::memcpy(event.u.input2.data, report.data(), size);
  event.u.input2.size = static_cast<std::uint16_t>(size);
  return write_uhid_event(fd_.get(), event, logger, "UHID_INPUT2");
}

bool UhidDevice::reply_get_report(std::uint32_t request_id,
                                  std::span<const std::uint8_t> data,
                                  Logger &logger) {
  if (!fd_ || !created_) {
    return false;
  }
  uhid_event event{};
  event.type = UHID_GET_REPORT_REPLY;
  event.u.get_report_reply.id = request_id;
  if (data.empty()) {
    event.u.get_report_reply.err = EIO;
  } else {
    const std::size_t size =
        std::min(data.size(), sizeof(event.u.get_report_reply.data));
    std::memcpy(event.u.get_report_reply.data, data.data(), size);
    event.u.get_report_reply.size = static_cast<std::uint16_t>(size);
  }
  return write_uhid_event(fd_.get(), event, logger, "UHID_GET_REPORT_REPLY");
}

bool UhidDevice::reply_set_report(std::uint32_t request_id,
                                  std::uint16_t error, Logger &logger) {
  if (!fd_ || !created_) {
    return false;
  }
  uhid_event event{};
  event.type = UHID_SET_REPORT_REPLY;
  event.u.set_report_reply.id = request_id;
  event.u.set_report_reply.err = error;
  return write_uhid_event(fd_.get(), event, logger, "UHID_SET_REPORT_REPLY");
}

bool UhidDevice::drain_events(const EventHandlers &handlers, Logger &logger) {
  if (!fd_) {
    return false;
  }
  while (true) {
    uhid_event event{};
    const ssize_t got = ::read(fd_.get(), &event, sizeof(event));
    if (got < 0) {
      if (errno == EAGAIN || errno == EWOULDBLOCK) {
        return true;
      }
      if (errno == EINTR) {
        continue;
      }
      logger.log("uhid", LogLevel::Error,
                 std::string("uhid read failed: ") + std::strerror(errno));
      return false;
    }
    if (got == 0) {
      return true;
    }

    switch (event.type) {
    case UHID_OUTPUT: {
      if (handlers.on_output) {
        UhidOutputEvent output;
        output.data.assign(event.u.output.data,
                           event.u.output.data + event.u.output.size);
        handlers.on_output(std::move(output));
      }
      break;
    }
    case UHID_GET_REPORT: {
      if (handlers.on_get_report) {
        handlers.on_get_report(UhidGetReportEvent{
            .request_id = event.u.get_report.id,
            .report_id = event.u.get_report.rnum,
        });
      }
      break;
    }
    case UHID_SET_REPORT: {
      if (handlers.on_set_report) {
        UhidSetReportEvent set;
        set.request_id = event.u.set_report.id;
        set.report_id = event.u.set_report.rnum;
        set.data.assign(event.u.set_report.data,
                        event.u.set_report.data + event.u.set_report.size);
        handlers.on_set_report(std::move(set));
      }
      break;
    }
    case UHID_START:
    case UHID_STOP:
    case UHID_OPEN:
    case UHID_CLOSE:
      break;
    default:
      break;
    }
  }
}

} // namespace vds

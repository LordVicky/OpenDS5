/* SPDX-License-Identifier: MIT */
/* Copyright (C) 2026 Jihong Min <hurryman2212@gmail.com> */
#ifndef _UAPI_VDS_H
#define _UAPI_VDS_H

#ifdef _WIN32
#ifdef _KERNEL_MODE
typedef unsigned char __u8;
typedef unsigned short __u16;
typedef unsigned long __u32;
typedef unsigned long long __u64;
#else
#include <stdint.h>
typedef uint8_t __u8;
typedef uint16_t __u16;
typedef uint32_t __u32;
typedef uint64_t __u64;
#endif
#else
#include <linux/ioctl.h>
#include <linux/types.h>
#endif

#define VDS_IOC_MAGIC 'V'
#define VDS_FRAME_MAX_PAYLOAD 4096

enum {
	VDS_MIN_PORT_COUNT = 1,
	VDS_MAX_PORT_COUNT = 4,
};

enum vds_profile {
	VDS_PROFILE_DS5 = 0,
	VDS_PROFILE_DSE = 1,
};

enum vds_frame_type {
	VDS_FRAME_STATUS = 0,
	VDS_FRAME_USB_HID_OUT = 1,
	VDS_FRAME_USB_FEATURE_GET = 2,
	VDS_FRAME_USB_FEATURE_SET = 3,
	VDS_FRAME_USB_AUDIO_OUT = 4,
	VDS_FRAME_USB_HID_IN = 5,
	VDS_FRAME_USB_FEATURE_REPLY = 6,
	VDS_FRAME_USB_INTERFACE = 7,
	VDS_FRAME_BT_CONTROL_PACKET = 8,
	VDS_FRAME_BT_INTERRUPT_PACKET = 9,
	VDS_FRAME_USB_AUDIO_IN = 10,
};

enum vds_status_flags {
	VDS_STATUS_CONNECTED = 1u << 0,
	VDS_STATUS_CONFIGURED = 1u << 1,
	VDS_STATUS_HID_ENABLED = 1u << 2,
	VDS_STATUS_AUDIO_ENABLED = 1u << 3,
};

enum vds_port_info_flags {
	VDS_PORT_INFO_ENABLED = 1u << 0,
	VDS_PORT_INFO_ACTIVE = 1u << 1,
	VDS_PORT_INFO_PRIMARY = VDS_PORT_INFO_ACTIVE,
	VDS_PORT_INFO_USB_PLUGGED = 1u << 2,
	VDS_PORT_INFO_BOUND = 1u << 3,
	VDS_PORT_INFO_PROFILE_VALID = 1u << 4,
	VDS_PORT_INFO_USB_PROFILE_VALID = 1u << 5,
};

enum vds_usb_interface_type {
	VDS_USB_INTERFACE_HID = 0,
	VDS_USB_INTERFACE_AUDIO_OUT = 1,
	VDS_USB_INTERFACE_AUDIO_IN = 2,
};

enum {
	VDS_DRIVER_INFO_VERSION = 1,
	VDS_DRIVER_VERSION_MAX = 64,
	VDS_PORT_INFO_VERSION = 2,
	VDS_PORT_BIND_VERSION = 1,
	VDS_FILTER_DEVICE_LIST_VERSION = 1,
	VDS_FILTER_DEVICE_CHANGE_VERSION = 1,
	VDS_FILTER_MAX_DEVICES = 8,
};

enum vds_filter_device_flags {
	VDS_FILTER_DEVICE_PRESENT = 1u << 0,
	VDS_FILTER_DEVICE_REPORT_TARGET = 1u << 1,
	VDS_FILTER_DEVICE_ACCESS_RESTRICTED = 1u << 2,
};

struct vds_frame_header {
	__u16 type;
	__u16 flags;
	__u32 length;
	__u64 sequence;
};

struct vds_usb_interface_event {
	__u8 interface_number;
	__u8 altsetting;
	__u8 interface_type;
	__u8 reserved;
};

struct vds_status {
	__u32 status_flags;
	__u32 profile;
	__u64 frames_to_user;
	__u64 frames_from_user;
};

struct vds_driver_info {
	__u32 version;
	__u32 size;
	char driver_version[VDS_DRIVER_VERSION_MAX];
};

struct vds_profile_config {
	__u32 profile;
	__u32 polling_rate_mode;
};

struct vds_port_info {
	__u32 version;
	__u32 size;
	__u32 port_index;
	__u32 max_port;
	__u32 flags;
	__u32 profile;
	__u32 usb_profile;
};

struct vds_port_bind {
	__u32 version;
	__u32 size;
	__u32 profile;
	__u32 flags;
};

struct vds_filter_device_info {
	__u32 profile;
	char address[18];
	__u16 flags;
};

struct vds_filter_device_list {
	__u32 version;
	__u32 size;
	__u32 count;
	__u32 generation;
	struct vds_filter_device_info devices[VDS_FILTER_MAX_DEVICES];
};

struct vds_filter_device_change {
	__u32 version;
	__u32 size;
	__u32 generation;
	__u32 reserved;
};

#ifdef _WIN32
#define VDS_WIN_FILE_DEVICE_UNKNOWN 0x00000022
#define VDS_WIN_METHOD_BUFFERED 0
#define VDS_WIN_FILE_READ_DATA 0x0001
#define VDS_WIN_FILE_WRITE_DATA 0x0002
#define VDS_WIN_CTL_CODE(device_type, function, method, access)         \
	(((device_type) << 16) | ((access) << 14) | ((function) << 2) | \
	 (method))

#define VDS_IOCTL_GET_DRIVER_INFO                            \
	VDS_WIN_CTL_CODE(VDS_WIN_FILE_DEVICE_UNKNOWN, 0x800, \
			 VDS_WIN_METHOD_BUFFERED, VDS_WIN_FILE_READ_DATA)
#define VDS_IOCTL_GET_PORT_INFO                              \
	VDS_WIN_CTL_CODE(VDS_WIN_FILE_DEVICE_UNKNOWN, 0x802, \
			 VDS_WIN_METHOD_BUFFERED, VDS_WIN_FILE_READ_DATA)
#define VDS_IOCTL_BIND_PORT                                  \
	VDS_WIN_CTL_CODE(VDS_WIN_FILE_DEVICE_UNKNOWN, 0x803, \
			 VDS_WIN_METHOD_BUFFERED,            \
			 VDS_WIN_FILE_READ_DATA | VDS_WIN_FILE_WRITE_DATA)
#define VDS_IOCTL_UNBIND_PORT                                \
	VDS_WIN_CTL_CODE(VDS_WIN_FILE_DEVICE_UNKNOWN, 0x804, \
			 VDS_WIN_METHOD_BUFFERED,            \
			 VDS_WIN_FILE_READ_DATA | VDS_WIN_FILE_WRITE_DATA)
#define VDS_FILTER_IOCTL_GET_DEVICES                         \
	VDS_WIN_CTL_CODE(VDS_WIN_FILE_DEVICE_UNKNOWN, 0x900, \
			 VDS_WIN_METHOD_BUFFERED, VDS_WIN_FILE_READ_DATA)
#define VDS_FILTER_IOCTL_WAIT_DEVICE_CHANGE                  \
	VDS_WIN_CTL_CODE(VDS_WIN_FILE_DEVICE_UNKNOWN, 0x901, \
			 VDS_WIN_METHOD_BUFFERED,            \
			 VDS_WIN_FILE_READ_DATA | VDS_WIN_FILE_WRITE_DATA)
#else
#define VDS_IOC_GET_STATUS _IOR(VDS_IOC_MAGIC, 0x01, struct vds_status)
#define VDS_IOC_SET_PROFILE _IOW(VDS_IOC_MAGIC, 0x02, struct vds_profile_config)
#define VDS_IOC_CONNECT _IO(VDS_IOC_MAGIC, 0x03)
#define VDS_IOC_DISCONNECT _IO(VDS_IOC_MAGIC, 0x04)
#define VDS_IOC_GET_DRIVER_INFO \
	_IOR(VDS_IOC_MAGIC, 0x05, struct vds_driver_info)
#endif

#endif /* _UAPI_VDS_H */

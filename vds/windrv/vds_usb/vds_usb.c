// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jihong Min <hurryman2212@gmail.com>

#include <ntddk.h>
#include <wdf.h>

#include <initguid.h>

#include <usbspec.h>

#include <usb.h>
#include <usbbusif.h>
#include <usbioctl.h>

#include <usbdlib.h>
#include <wdfusb.h>

#include <usbiodef.h>

#include <UdeCx.h>

#include "uapi/vds.h"
#include "vds/ds5_usb.h"

#define VDS_CONFIGURE_HISTORY_SIZE 8
#define VDS_PCM_CHANNELS 4
#define VDS_CONTROL_RING_SIZE (256 * 1024)
#define VDS_HID_FEATURE_REPORT_SIZE 64
#define VDS_USB_DESCRIPTOR_TYPE_STRING 0x03
#define VDS_USB_DESCRIPTOR_TYPE_HID 0x21
#define VDS_USB_DESCRIPTOR_TYPE_HID_REPORT 0x22
#define VDS_USB_REQUEST_GET_DESCRIPTOR 0x06
#define VDS_USB_HID_GET_REPORT 0x01
#define VDS_USB_HID_GET_IDLE 0x02
#define VDS_USB_HID_GET_PROTOCOL 0x03
#define VDS_USB_HID_SET_REPORT 0x09
#define VDS_USB_HID_SET_IDLE 0x0a
#define VDS_USB_HID_SET_PROTOCOL 0x0b
#define VDS_USB_HID_REPORT_TYPE_INPUT 0x01
#define VDS_USB_HID_REPORT_TYPE_OUTPUT 0x02
#define VDS_USB_HID_REPORT_TYPE_FEATURE 0x03
static const ULONG vds_endpoint_release_delay_ms = 250;
static const ULONG vds_iso_out_delay_max_us = 20000;
static const ULONG vds_iso_out_delay_slack_compensation_us = 300;

typedef struct _VDS_CONFIGURE_RECORD {
  ULONG sequence;
  ULONG configure_type;
  ULONG interface_number;
  ULONG alt_setting;
  ULONG endpoints_to_configure;
  ULONG released_endpoints;
  ULONG configure_endpoint_addresses;
  ULONG released_endpoint_addresses;
} VDS_CONFIGURE_RECORD, *PVDS_CONFIGURE_RECORD;

typedef struct _VDS_PORT_STATE {
  PUDECXUSBDEVICE_INIT usb_device_init;
  UDECXUSBDEVICE usb_device;
  BOOLEAN usb_device_plugged;
  ULONG usb_profile;
  BOOLEAN usb_profile_valid;
  ULONG profile;
  BOOLEAN bound;
  WDFFILEOBJECT bound_file;
  WDFQUEUE control_read_queue;
  KSPIN_LOCK control_ring_lock;
  ULONG control_ring_head;
  ULONG control_ring_size;
  ULONGLONG frame_sequence;
  UCHAR control_ring[VDS_CONTROL_RING_SIZE];
  KSPIN_LOCK hid_state_lock;
  UCHAR last_hid_input[VDS_USB_INPUT_REPORT_SIZE];
  BOOLEAN have_last_hid_input;
  UCHAR feature_cache[256][VDS_HID_FEATURE_REPORT_SIZE];
  BOOLEAN feature_cache_valid[256];
} VDS_PORT_STATE, *PVDS_PORT_STATE;

typedef struct _VDS_DEVICE_CONTEXT {
  USB_BUS_INTERFACE_USBDI_V3 usb_bus_interface;
  ULONG max_port;
  LONG control_urb_count;
  LONG last_control_bm_request;
  LONG last_control_b_request;
  LONG last_control_w_value;
  LONG last_control_w_index;
  LONG last_control_w_length;
  LONG last_control_bytes_completed;
  LONG iso_out_request_count;
  LONG iso_out_byte_count;
  LONG last_pcm_frame_count;
  LONG last_pcm_sample[VDS_PCM_CHANNELS];
  LONG last_pcm_peak[VDS_PCM_CHANNELS];
  LONG non_iso_urb_count;
  LONG last_iso_packets;
  LONG last_iso_length;
  LONG last_non_iso_function;
  LONG endpoint_reset_count;
  LONG endpoint_start_count;
  LONG endpoint_purge_count;
  LONG configure_count;
  LONG configure_endpoint_count;
  LONG configure_release_count;
  LONG last_configure_type;
  LONG last_interface;
  LONG last_alt_setting;
  LONG configure_history_sequence;
  VDS_CONFIGURE_RECORD configure_history[VDS_CONFIGURE_HISTORY_SIZE];
  LONG async_urb_complete_count;
  LONG async_urb_forward_failure_count;
  LONG delayed_iso_urb_count;
  LONG delayed_iso_urb_complete_count;
  LONG delayed_iso_urb_timer_failure_count;
  LONG endpoint_queue_refresh_count;
  LONG endpoint_queue_refresh_failure_count;
  LONG endpoint_release_delay_count;
  LONG endpoint_release_delay_complete_count;
  LONG endpoint_release_delay_timer_failure_count;
  WDFQUEUE urb_completion_queue;
  WDFDPC urb_completion_dpc;
  VDS_PORT_STATE port_state[VDS_MAX_PORT_COUNT];
  WDFDEVICE control_devices[VDS_MAX_PORT_COUNT];
  WDFQUEUE hid_in_queue;
  KSPIN_LOCK port_state_lock;
} VDS_DEVICE_CONTEXT, *PVDS_DEVICE_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(VDS_DEVICE_CONTEXT, VdsGetDeviceContext)

typedef struct _VDS_UDECX_DEVICE_CONTEXT {
  WDFDEVICE wdf_device;
  ULONG port_index;
} VDS_UDECX_DEVICE_CONTEXT, *PVDS_UDECX_DEVICE_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(VDS_UDECX_DEVICE_CONTEXT,
                                   VdsGetUdecxDeviceContext)

typedef struct _VDS_CONTROL_DEVICE_CONTEXT {
  WDFDEVICE parent_device;
  ULONG port_index;
} VDS_CONTROL_DEVICE_CONTEXT, *PVDS_CONTROL_DEVICE_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(VDS_CONTROL_DEVICE_CONTEXT,
                                   VdsGetControlDeviceContext)

typedef struct _VDS_UDECX_ENDPOINT_CONTEXT {
  WDFDEVICE device;
  ULONG port_index;
  WDFQUEUE queue;
  UCHAR endpoint_address;
  PFN_WDF_IO_QUEUE_IO_INTERNAL_DEVICE_CONTROL evt_io_internal_device_control;
} VDS_UDECX_ENDPOINT_CONTEXT, *PVDS_UDECX_ENDPOINT_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(VDS_UDECX_ENDPOINT_CONTEXT,
                                   VdsGetUdecxEndpointContext)

typedef struct _VDS_URB_REQUEST_CONTEXT {
  ULONG bytes_completed;
  USBD_STATUS usbd_status;
  NTSTATUS nt_status;
  BOOLEAN complete_with_usbd_status;
} VDS_URB_REQUEST_CONTEXT, *PVDS_URB_REQUEST_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(VDS_URB_REQUEST_CONTEXT,
                                   VdsGetUrbRequestContext)

typedef struct _VDS_URB_COMPLETION_DPC_CONTEXT {
  WDFDEVICE device;
} VDS_URB_COMPLETION_DPC_CONTEXT, *PVDS_URB_COMPLETION_DPC_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(VDS_URB_COMPLETION_DPC_CONTEXT,
                                   VdsGetUrbCompletionDpcContext)

typedef struct _VDS_DELAYED_URB_COMPLETION_CONTEXT {
  WDFDEVICE device;
  ULONG port_index;
  WDFREQUEST request;
  ULONG bytes_completed;
  USBD_STATUS usbd_status;
  NTSTATUS nt_status;
  USHORT queued_frame_type;
  ULONG queued_frame_length;
  BOOLEAN complete_with_usbd_status;
  BOOLEAN queue_frame_on_completion;
  UCHAR queued_frame_payload[VDS_FRAME_MAX_PAYLOAD];
} VDS_DELAYED_URB_COMPLETION_CONTEXT, *PVDS_DELAYED_URB_COMPLETION_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(VDS_DELAYED_URB_COMPLETION_CONTEXT,
                                   VdsGetDelayedUrbCompletionContext)

typedef struct _VDS_DELAYED_CONFIGURE_COMPLETION_CONTEXT {
  WDFDEVICE device;
  WDFREQUEST request;
  NTSTATUS status;
  ULONG port_index;
} VDS_DELAYED_CONFIGURE_COMPLETION_CONTEXT,
    *PVDS_DELAYED_CONFIGURE_COMPLETION_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(VDS_DELAYED_CONFIGURE_COMPLETION_CONTEXT,
                                   VdsGetDelayedConfigureCompletionContext)

typedef struct _VDS_ENDPOINT_QUEUE_CONTEXT {
  WDFDEVICE device;
  ULONG port_index;
  UCHAR endpoint_address;
  ULONG request_count;
  ULONGLONG byte_count;
} VDS_ENDPOINT_QUEUE_CONTEXT, *PVDS_ENDPOINT_QUEUE_CONTEXT;

WDF_DECLARE_CONTEXT_TYPE_WITH_NAME(VDS_ENDPOINT_QUEUE_CONTEXT,
                                   VdsGetEndpointQueueContext)

typedef struct _VDS_AUDIO_STATS {
  ULONG control_urb_count;
  ULONG last_control_bm_request;
  ULONG last_control_b_request;
  ULONG last_control_w_value;
  ULONG last_control_w_index;
  ULONG last_control_w_length;
  ULONG last_control_bytes_completed;
  ULONG iso_out_request_count;
  ULONG iso_out_byte_count;
  LONG last_pcm_frame_count;
  LONG last_pcm_sample[VDS_PCM_CHANNELS];
  LONG last_pcm_peak[VDS_PCM_CHANNELS];
  ULONG non_iso_urb_count;
  ULONG last_iso_packets;
  ULONG last_iso_length;
  ULONG last_non_iso_function;
  ULONG endpoint_reset_count;
  ULONG endpoint_start_count;
  ULONG endpoint_purge_count;
  ULONG configure_count;
  ULONG configure_endpoint_count;
  ULONG configure_release_count;
  ULONG last_configure_type;
  ULONG last_interface;
  ULONG last_alt_setting;
  ULONG configure_history_sequence;
  VDS_CONFIGURE_RECORD configure_history[VDS_CONFIGURE_HISTORY_SIZE];
  ULONG async_urb_complete_count;
  ULONG async_urb_forward_failure_count;
  ULONG delayed_iso_urb_count;
  ULONG delayed_iso_urb_complete_count;
  ULONG delayed_iso_urb_timer_failure_count;
  ULONG endpoint_queue_refresh_count;
  ULONG endpoint_queue_refresh_failure_count;
  ULONG endpoint_release_delay_count;
  ULONG endpoint_release_delay_complete_count;
  ULONG endpoint_release_delay_timer_failure_count;
} VDS_AUDIO_STATS, *PVDS_AUDIO_STATS;

typedef struct _VDS_DESCRIPTOR_VIEW {
  const UCHAR *data;
  USHORT size;
} VDS_DESCRIPTOR_VIEW, *PVDS_DESCRIPTOR_VIEW;

#define VDS_IOCTL_GET_AUDIO_STATS                                              \
  CTL_CODE(FILE_DEVICE_UNKNOWN, 0x801, METHOD_BUFFERED, FILE_READ_DATA)

static BOOLEAN VdsIsValidProfile(ULONG profile) {
  return profile == VDS_PROFILE_DS5 || profile == VDS_PROFILE_DSE;
}

static NTSTATUS VdsStageFailure(NTSTATUS status, ULONG stage) {
  UNREFERENCED_PARAMETER(stage);

  KdPrint(("vds_usb: stage 0x%lx failed status=0x%08lx\n", stage, status));
  return status;
}

static ULONG VdsReadMaxPort(WDFDRIVER driver) {
  DECLARE_CONST_UNICODE_STRING(value_name, L"MaxPort");
  WDFKEY parameters_key;
  NTSTATUS status;
  ULONG max_port;

  max_port = VDS_MAX_PORT_COUNT;
  status = WdfDriverOpenParametersRegistryKey(
      driver, KEY_READ, WDF_NO_OBJECT_ATTRIBUTES, &parameters_key);
  if (!NT_SUCCESS(status)) {
    KdPrint(("vds_usb: MaxPort default=%lu registry status=0x%08lx\n", max_port,
             status));
    return max_port;
  }

  status = WdfRegistryQueryULong(parameters_key, &value_name, &max_port);
  WdfRegistryClose(parameters_key);
  if (!NT_SUCCESS(status)) {
    KdPrint(("vds_usb: MaxPort default=%lu query status=0x%08lx\n", max_port,
             status));
    return max_port;
  }

  if (max_port < VDS_MIN_PORT_COUNT || max_port > VDS_MAX_PORT_COUNT) {
    KdPrint(("vds_usb: MaxPort=%lu out of range, using %lu\n", max_port,
             VDS_MAX_PORT_COUNT));
    return VDS_MAX_PORT_COUNT;
  }

  KdPrint(("vds_usb: MaxPort=%lu\n", max_port));
  return max_port;
}

static VDS_DESCRIPTOR_VIEW VdsDeviceDescriptorForProfile(ULONG profile) {
  VDS_DESCRIPTOR_VIEW descriptor;

  if (profile == VDS_PROFILE_DS5) {
    descriptor.data = vds_ds5_usb_device_descriptor;
    descriptor.size = (USHORT)sizeof(vds_ds5_usb_device_descriptor);
    return descriptor;
  }

  descriptor.data = vds_dse_usb_device_descriptor;
  descriptor.size = (USHORT)sizeof(vds_dse_usb_device_descriptor);
  return descriptor;
}

static VDS_DESCRIPTOR_VIEW VdsConfigurationDescriptorForProfile(ULONG profile) {
  VDS_DESCRIPTOR_VIEW descriptor;

  if (profile == VDS_PROFILE_DS5) {
    descriptor.data = vds_ds5_usb_configuration_descriptor;
    descriptor.size = (USHORT)sizeof(vds_ds5_usb_configuration_descriptor);
    return descriptor;
  }

  descriptor.data = vds_dse_usb_configuration_descriptor;
  descriptor.size = (USHORT)sizeof(vds_dse_usb_configuration_descriptor);
  return descriptor;
}

static VDS_DESCRIPTOR_VIEW VdsHidDescriptorForProfile(ULONG profile) {
  VDS_DESCRIPTOR_VIEW descriptor;

  if (profile == VDS_PROFILE_DS5) {
    descriptor.data = vds_ds5_usb_hid_descriptor;
    descriptor.size = (USHORT)sizeof(vds_ds5_usb_hid_descriptor);
    return descriptor;
  }

  descriptor.data = vds_dse_usb_hid_descriptor;
  descriptor.size = (USHORT)sizeof(vds_dse_usb_hid_descriptor);
  return descriptor;
}

static VDS_DESCRIPTOR_VIEW VdsHidReportDescriptorForProfile(ULONG profile) {
  VDS_DESCRIPTOR_VIEW descriptor;

  if (profile == VDS_PROFILE_DS5) {
    descriptor.data = vds_ds5_usb_hid_report_descriptor;
    descriptor.size = (USHORT)sizeof(vds_ds5_usb_hid_report_descriptor);
    return descriptor;
  }

  descriptor.data = vds_dse_usb_hid_report_descriptor;
  descriptor.size = (USHORT)sizeof(vds_dse_usb_hid_report_descriptor);
  return descriptor;
}

static const CHAR *VdsProductStringForProfile(ULONG profile) {
  if (profile == VDS_PROFILE_DS5) {
    return VDS_DS5_USB_PRODUCT_STRING;
  }
  return VDS_DSE_USB_PRODUCT_STRING;
}

static NTSTATUS VdsAddStringDescriptor(PUDECXUSBDEVICE_INIT usb_device_init,
                                       const CHAR *string, UCHAR string_index) {
  WCHAR buffer[128];
  UNICODE_STRING unicode;
  ULONG index;

  if (string == NULL) {
    return STATUS_INVALID_PARAMETER;
  }

  for (index = 0; string[index] != '\0'; ++index) {
    if (index + 1 >= RTL_NUMBER_OF(buffer)) {
      return STATUS_BUFFER_TOO_SMALL;
    }
    buffer[index] = (WCHAR)(UCHAR)string[index];
  }
  buffer[index] = L'\0';

  RtlInitUnicodeString(&unicode, buffer);
  return UdecxUsbDeviceInitAddStringDescriptor(usb_device_init, &unicode,
                                               string_index, 0x0409);
}

static VOID VdsUsbBusInterfaceReference(PVOID bus_context) {
  UNREFERENCED_PARAMETER(bus_context);
}

static VOID VdsUsbBusInterfaceDereference(PVOID bus_context) {
  UNREFERENCED_PARAMETER(bus_context);
}

static VOID VdsUsbBusGetUsbdVersion(PVOID bus_context,
                                    PUSBD_VERSION_INFORMATION version_info,
                                    PULONG hcd_capabilities) {
  UNREFERENCED_PARAMETER(bus_context);

  if (version_info != NULL) {
    version_info->USBDI_Version = USBDI_VERSION;
    version_info->Supported_USB_Version = 0x0200;
  }

  if (hcd_capabilities != NULL) {
    *hcd_capabilities = USB_HCD_CAPS_SUPPORTS_RT_THREADS;
  }
}

static NTSTATUS VdsUsbBusQueryBusTime(PVOID bus_context,
                                      PULONG current_usb_frame) {
  UNREFERENCED_PARAMETER(bus_context);

  if (current_usb_frame == NULL) {
    return STATUS_INVALID_PARAMETER;
  }

  *current_usb_frame = (ULONG)(KeQueryInterruptTime() / 10000);
  return STATUS_SUCCESS;
}

static NTSTATUS VdsUsbBusSubmitIsoOutUrb(PVOID bus_context, PURB urb) {
  UNREFERENCED_PARAMETER(bus_context);
  UNREFERENCED_PARAMETER(urb);

  return STATUS_NOT_SUPPORTED;
}

static NTSTATUS
VdsUsbBusQueryBusInformation(PVOID bus_context, ULONG level,
                             PVOID bus_information_buffer,
                             PULONG bus_information_buffer_length,
                             PULONG bus_information_actual_length) {
  PUSB_BUS_INFORMATION_LEVEL_0 information;

  UNREFERENCED_PARAMETER(bus_context);

  if (level != 0 || bus_information_buffer_length == NULL) {
    return STATUS_NOT_SUPPORTED;
  }

  if (bus_information_actual_length != NULL) {
    *bus_information_actual_length = sizeof(USB_BUS_INFORMATION_LEVEL_0);
  }

  if (*bus_information_buffer_length < sizeof(USB_BUS_INFORMATION_LEVEL_0)) {
    *bus_information_buffer_length = sizeof(USB_BUS_INFORMATION_LEVEL_0);
    return STATUS_BUFFER_TOO_SMALL;
  }

  if (bus_information_buffer == NULL) {
    return STATUS_INVALID_PARAMETER;
  }

  information = (PUSB_BUS_INFORMATION_LEVEL_0)bus_information_buffer;
  information->TotalBandwidth = 480000000;
  information->ConsumedBandwidth = 0;
  *bus_information_buffer_length = sizeof(*information);
  return STATUS_SUCCESS;
}

static BOOLEAN VdsUsbBusIsDeviceHighSpeed(PVOID bus_context) {
  UNREFERENCED_PARAMETER(bus_context);

  return TRUE;
}

static NTSTATUS VdsUsbBusEnumLogEntry(PVOID bus_context, ULONG driver_tag,
                                      ULONG enum_tag, ULONG p1, ULONG p2) {
  UNREFERENCED_PARAMETER(bus_context);
  UNREFERENCED_PARAMETER(driver_tag);
  UNREFERENCED_PARAMETER(enum_tag);
  UNREFERENCED_PARAMETER(p1);
  UNREFERENCED_PARAMETER(p2);

  return STATUS_SUCCESS;
}

static NTSTATUS VdsUsbBusQueryBusTimeEx(PVOID bus_context,
                                        PULONG high_speed_frame_counter) {
  UNREFERENCED_PARAMETER(bus_context);

  if (high_speed_frame_counter == NULL) {
    return STATUS_INVALID_PARAMETER;
  }

  *high_speed_frame_counter = (ULONG)(KeQueryInterruptTime() / 1250);
  return STATUS_SUCCESS;
}

static NTSTATUS
VdsUsbBusQueryControllerType(PVOID bus_context, PULONG hcdi_option_flags,
                             PUSHORT pci_vendor_id, PUSHORT pci_device_id,
                             PUCHAR pci_class, PUCHAR pci_sub_class,
                             PUCHAR pci_revision_id, PUCHAR pci_prog_if) {
  UNREFERENCED_PARAMETER(bus_context);

  if (hcdi_option_flags != NULL) {
    *hcdi_option_flags = 0;
  }
  if (pci_vendor_id != NULL) {
    *pci_vendor_id = 0;
  }
  if (pci_device_id != NULL) {
    *pci_device_id = 0;
  }
  if (pci_class != NULL) {
    *pci_class = 0x0c;
  }
  if (pci_sub_class != NULL) {
    *pci_sub_class = 0x03;
  }
  if (pci_revision_id != NULL) {
    *pci_revision_id = 0;
  }
  if (pci_prog_if != NULL) {
    *pci_prog_if = 0x30;
  }

  return STATUS_SUCCESS;
}

static NTSTATUS VdsAddUsbBusInterface(WDFDEVICE device) {
  PVDS_DEVICE_CONTEXT context;
  WDF_QUERY_INTERFACE_CONFIG interface_config;

  context = VdsGetDeviceContext(device);
  RtlZeroMemory(&context->usb_bus_interface,
                sizeof(context->usb_bus_interface));
  context->usb_bus_interface.Size = sizeof(context->usb_bus_interface);
  context->usb_bus_interface.Version = USB_BUSIF_USBDI_VERSION_3;
  context->usb_bus_interface.BusContext = device;
  context->usb_bus_interface.InterfaceReference = VdsUsbBusInterfaceReference;
  context->usb_bus_interface.InterfaceDereference =
      VdsUsbBusInterfaceDereference;
  context->usb_bus_interface.GetUSBDIVersion = VdsUsbBusGetUsbdVersion;
  context->usb_bus_interface.QueryBusTime = VdsUsbBusQueryBusTime;
  context->usb_bus_interface.SubmitIsoOutUrb = VdsUsbBusSubmitIsoOutUrb;
  context->usb_bus_interface.QueryBusInformation = VdsUsbBusQueryBusInformation;
  context->usb_bus_interface.IsDeviceHighSpeed = VdsUsbBusIsDeviceHighSpeed;
  context->usb_bus_interface.EnumLogEntry = VdsUsbBusEnumLogEntry;
  context->usb_bus_interface.QueryBusTimeEx = VdsUsbBusQueryBusTimeEx;
  context->usb_bus_interface.QueryControllerType = VdsUsbBusQueryControllerType;

  WDF_QUERY_INTERFACE_CONFIG_INIT(&interface_config,
                                  (PINTERFACE)&context->usb_bus_interface,
                                  &USB_BUS_INTERFACE_USBDI_GUID, NULL);
  return WdfDeviceAddQueryInterface(device, &interface_config);
}

static VOID VdsEvtEndpointReset(UDECXUSBENDPOINT endpoint, WDFREQUEST request) {
  PVDS_UDECX_ENDPOINT_CONTEXT endpoint_context;
  PVDS_DEVICE_CONTEXT device_context;

  endpoint_context = VdsGetUdecxEndpointContext(endpoint);
  device_context = VdsGetDeviceContext(endpoint_context->device);
  InterlockedIncrement(&device_context->endpoint_reset_count);
  WdfRequestComplete(request, STATUS_SUCCESS);
}

static VOID VdsEvtCompleteUrbDpc(WDFDPC dpc) {
  PVDS_URB_COMPLETION_DPC_CONTEXT dpc_context;
  PVDS_DEVICE_CONTEXT device_context;
  WDFREQUEST request;
  NTSTATUS status;

  dpc_context = VdsGetUrbCompletionDpcContext(dpc);
  device_context = VdsGetDeviceContext(dpc_context->device);

  for (;;) {
    PVDS_URB_REQUEST_CONTEXT request_context;

    status = WdfIoQueueRetrieveNextRequest(device_context->urb_completion_queue,
                                           &request);
    if (!NT_SUCCESS(status)) {
      break;
    }

    request_context = VdsGetUrbRequestContext(request);
    UdecxUrbSetBytesCompleted(request, request_context->bytes_completed);
    if (request_context->complete_with_usbd_status) {
      UdecxUrbComplete(request, request_context->usbd_status);
    } else {
      UdecxUrbCompleteWithNtStatus(request, request_context->nt_status);
    }
    InterlockedIncrement(&device_context->async_urb_complete_count);
  }
}

static VOID VdsCompleteUrbAsync(WDFDEVICE device, WDFREQUEST request,
                                ULONG bytes_completed, USBD_STATUS usbd_status,
                                NTSTATUS nt_status,
                                BOOLEAN complete_with_usbd_status) {
  PVDS_DEVICE_CONTEXT device_context;
  PVDS_URB_REQUEST_CONTEXT request_context;
  WDF_OBJECT_ATTRIBUTES attributes;
  NTSTATUS status;

  device_context = VdsGetDeviceContext(device);
  if (device_context->urb_completion_queue == NULL ||
      device_context->urb_completion_dpc == NULL) {
    UdecxUrbSetBytesCompleted(request, bytes_completed);
    if (complete_with_usbd_status) {
      UdecxUrbComplete(request, usbd_status);
    } else {
      UdecxUrbCompleteWithNtStatus(request, nt_status);
    }
    return;
  }

  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes, VDS_URB_REQUEST_CONTEXT);
  status =
      WdfObjectAllocateContext(request, &attributes, (PVOID *)&request_context);
  if (!NT_SUCCESS(status)) {
    InterlockedIncrement(&device_context->async_urb_forward_failure_count);
    UdecxUrbSetBytesCompleted(request, 0);
    UdecxUrbCompleteWithNtStatus(request, status);
    return;
  }

  request_context->bytes_completed = bytes_completed;
  request_context->usbd_status = usbd_status;
  request_context->nt_status = nt_status;
  request_context->complete_with_usbd_status = complete_with_usbd_status;

  status =
      WdfRequestForwardToIoQueue(request, device_context->urb_completion_queue);
  if (!NT_SUCCESS(status)) {
    InterlockedIncrement(&device_context->async_urb_forward_failure_count);
    UdecxUrbSetBytesCompleted(request, 0);
    UdecxUrbCompleteWithNtStatus(request, status);
    return;
  }

  WdfDpcEnqueue(device_context->urb_completion_dpc);
}

static VOID VdsEvtDelayedConfigureCompletionTimer(WDFTIMER timer) {
  PVDS_DELAYED_CONFIGURE_COMPLETION_CONTEXT timer_context;
  PVDS_DEVICE_CONTEXT device_context;

  timer_context = VdsGetDelayedConfigureCompletionContext(timer);
  device_context = VdsGetDeviceContext(timer_context->device);
  InterlockedIncrement(&device_context->endpoint_release_delay_complete_count);

  WdfRequestComplete(timer_context->request, timer_context->status);
  WdfObjectDelete(timer);
}

static BOOLEAN VdsCompleteConfigureAfterDelay(WDFDEVICE device,
                                              WDFREQUEST request,
                                              NTSTATUS status, ULONG delay_ms) {
  PVDS_DELAYED_CONFIGURE_COMPLETION_CONTEXT timer_context;
  PVDS_DEVICE_CONTEXT device_context;
  WDF_OBJECT_ATTRIBUTES attributes;
  WDF_TIMER_CONFIG timer_config;
  WDFTIMER timer;
  NTSTATUS timer_status;

  if (delay_ms == 0) {
    return FALSE;
  }

  device_context = VdsGetDeviceContext(device);
  WDF_TIMER_CONFIG_INIT(&timer_config, VdsEvtDelayedConfigureCompletionTimer);
  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(
      &attributes, VDS_DELAYED_CONFIGURE_COMPLETION_CONTEXT);
  attributes.ParentObject = device;
  timer_status = WdfTimerCreate(&timer_config, &attributes, &timer);
  if (!NT_SUCCESS(timer_status)) {
    InterlockedIncrement(
        &device_context->endpoint_release_delay_timer_failure_count);
    return FALSE;
  }

  timer_context = VdsGetDelayedConfigureCompletionContext(timer);
  timer_context->device = device;
  timer_context->request = request;
  timer_context->status = status;
  InterlockedIncrement(&device_context->endpoint_release_delay_count);
  WdfTimerStart(timer, WDF_REL_TIMEOUT_IN_MS(delay_ms));
  return TRUE;
}

static VOID VdsInitializePortState(PVDS_PORT_STATE port_state) {
  KeInitializeSpinLock(&port_state->control_ring_lock);
  KeInitializeSpinLock(&port_state->hid_state_lock);
  RtlZeroMemory(port_state->last_hid_input, sizeof(port_state->last_hid_input));
  port_state->last_hid_input[0] = VDS_USB_INPUT_REPORT_ID;
  port_state->last_hid_input[1] = 0x80;
  port_state->last_hid_input[2] = 0x80;
  port_state->last_hid_input[3] = 0x80;
  port_state->last_hid_input[4] = 0x80;
  port_state->have_last_hid_input = TRUE;
}

static VOID VdsControlRingWriteLocked(PVDS_PORT_STATE port_state,
                                      const UCHAR *bytes, ULONG byte_count) {
  ULONG tail;
  ULONG first;

  tail = (port_state->control_ring_head + port_state->control_ring_size) %
         VDS_CONTROL_RING_SIZE;
  first = min(byte_count, VDS_CONTROL_RING_SIZE - tail);
  RtlCopyMemory(port_state->control_ring + tail, bytes, first);
  if (byte_count > first) {
    RtlCopyMemory(port_state->control_ring, bytes + first, byte_count - first);
  }
  port_state->control_ring_size += byte_count;
}

static ULONG VdsControlRingReadLocked(PVDS_PORT_STATE port_state, UCHAR *bytes,
                                      ULONG byte_count) {
  ULONG first;

  byte_count = min(byte_count, port_state->control_ring_size);
  first =
      min(byte_count, VDS_CONTROL_RING_SIZE - port_state->control_ring_head);
  RtlCopyMemory(bytes, port_state->control_ring + port_state->control_ring_head,
                first);
  if (byte_count > first) {
    RtlCopyMemory(bytes + first, port_state->control_ring, byte_count - first);
  }
  port_state->control_ring_head =
      (port_state->control_ring_head + byte_count) % VDS_CONTROL_RING_SIZE;
  port_state->control_ring_size -= byte_count;
  return byte_count;
}

static VOID VdsCompleteControlReadRequests(PVDS_PORT_STATE port_state) {
  WDFREQUEST request;
  NTSTATUS status;

  if (port_state->control_read_queue == NULL) {
    return;
  }

  for (;;) {
    UCHAR *buffer;
    size_t buffer_length;
    ULONG bytes_to_read;
    ULONG bytes_read;
    KIRQL old_irql;

    KeAcquireSpinLock(&port_state->control_ring_lock, &old_irql);
    bytes_to_read = port_state->control_ring_size;
    KeReleaseSpinLock(&port_state->control_ring_lock, old_irql);
    if (bytes_to_read == 0) {
      return;
    }

    status =
        WdfIoQueueRetrieveNextRequest(port_state->control_read_queue, &request);
    if (!NT_SUCCESS(status)) {
      return;
    }

    status = WdfRequestRetrieveOutputBuffer(request, 1, (PVOID *)&buffer,
                                            &buffer_length);
    if (!NT_SUCCESS(status)) {
      WdfRequestComplete(request, status);
      continue;
    }

    KeAcquireSpinLock(&port_state->control_ring_lock, &old_irql);
    bytes_read =
        VdsControlRingReadLocked(port_state, buffer, (ULONG)buffer_length);
    KeReleaseSpinLock(&port_state->control_ring_lock, old_irql);
    WdfRequestCompleteWithInformation(request, STATUS_SUCCESS, bytes_read);
  }
}

static BOOLEAN VdsPortReadyForIo(PVDS_DEVICE_CONTEXT context,
                                 ULONG port_index) {
  BOOLEAN ready;
  KIRQL old_irql;

  if (port_index >= context->max_port) {
    return FALSE;
  }

  KeAcquireSpinLock(&context->port_state_lock, &old_irql);
  ready = context->port_state[port_index].bound;
  KeReleaseSpinLock(&context->port_state_lock, old_irql);
  return ready;
}

static NTSTATUS VdsQueueFrame(WDFDEVICE device, ULONG port_index,
                              USHORT frame_type, const UCHAR *payload,
                              ULONG payload_size) {
  PVDS_DEVICE_CONTEXT context;
  PVDS_PORT_STATE port_state;
  struct vds_frame_header header;
  ULONG frame_size;
  KIRQL old_irql;

  if (payload_size > VDS_FRAME_MAX_PAYLOAD) {
    return STATUS_INVALID_BUFFER_SIZE;
  }

  frame_size = sizeof(header) + payload_size;
  if (frame_size > VDS_CONTROL_RING_SIZE) {
    return STATUS_INVALID_BUFFER_SIZE;
  }

  context = VdsGetDeviceContext(device);
  if (port_index >= context->max_port) {
    return STATUS_DEVICE_NOT_READY;
  }
  port_state = &context->port_state[port_index];

  KeAcquireSpinLock(&port_state->control_ring_lock, &old_irql);
  if (frame_size > VDS_CONTROL_RING_SIZE - port_state->control_ring_size) {
    KeReleaseSpinLock(&port_state->control_ring_lock, old_irql);
    KdPrint(("vds_usb: dropping frame type=%u length=%lu ring=%lu\n",
             frame_type, payload_size, port_state->control_ring_size));
    return STATUS_BUFFER_OVERFLOW;
  }

  RtlZeroMemory(&header, sizeof(header));
  header.type = frame_type;
  header.length = payload_size;
  header.sequence = ++port_state->frame_sequence;
  VdsControlRingWriteLocked(port_state, (const UCHAR *)&header, sizeof(header));
  if (payload_size > 0) {
    VdsControlRingWriteLocked(port_state, payload, payload_size);
  }
  KeReleaseSpinLock(&port_state->control_ring_lock, old_irql);

  VdsCompleteControlReadRequests(port_state);
  return STATUS_SUCCESS;
}

static VOID VdsEvtDelayedUrbCompletionTimer(WDFTIMER timer) {
  PVDS_DELAYED_URB_COMPLETION_CONTEXT timer_context;
  PVDS_DEVICE_CONTEXT device_context;

  timer_context = VdsGetDelayedUrbCompletionContext(timer);
  device_context = VdsGetDeviceContext(timer_context->device);
  InterlockedIncrement(&device_context->delayed_iso_urb_complete_count);
  if (timer_context->queue_frame_on_completion) {
    (VOID) VdsQueueFrame(timer_context->device, timer_context->port_index,
                         timer_context->queued_frame_type,
                         timer_context->queued_frame_payload,
                         timer_context->queued_frame_length);
  }

  VdsCompleteUrbAsync(timer_context->device, timer_context->request,
                      timer_context->bytes_completed,
                      timer_context->usbd_status, timer_context->nt_status,
                      timer_context->complete_with_usbd_status);
  WdfObjectDelete(timer);
}

static BOOLEAN VdsCompleteUrbAfterDelay(
    WDFDEVICE device, ULONG port_index, WDFREQUEST request,
    ULONG bytes_completed, USBD_STATUS usbd_status, NTSTATUS nt_status,
    BOOLEAN complete_with_usbd_status, ULONG delay_us, USHORT queued_frame_type,
    const UCHAR *queued_frame_payload, ULONG queued_frame_length) {
  PVDS_DELAYED_URB_COMPLETION_CONTEXT timer_context;
  PVDS_DEVICE_CONTEXT device_context;
  WDF_OBJECT_ATTRIBUTES attributes;
  WDF_TIMER_CONFIG timer_config;
  WDFTIMER timer;
  LONGLONG due_time;
  NTSTATUS status;

  device_context = VdsGetDeviceContext(device);
  if (queued_frame_length > VDS_FRAME_MAX_PAYLOAD) {
    InterlockedIncrement(&device_context->delayed_iso_urb_timer_failure_count);
    return FALSE;
  }

  WDF_TIMER_CONFIG_INIT(&timer_config, VdsEvtDelayedUrbCompletionTimer);
  timer_config.AutomaticSerialization = FALSE;
  timer_config.UseHighResolutionTimer = TRUE;
  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes,
                                          VDS_DELAYED_URB_COMPLETION_CONTEXT);
  attributes.ParentObject = device;
  status = WdfTimerCreate(&timer_config, &attributes, &timer);
  if (!NT_SUCCESS(status)) {
    InterlockedIncrement(&device_context->delayed_iso_urb_timer_failure_count);
    return FALSE;
  }

  timer_context = VdsGetDelayedUrbCompletionContext(timer);
  timer_context->device = device;
  timer_context->port_index = port_index;
  timer_context->request = request;
  timer_context->bytes_completed = bytes_completed;
  timer_context->usbd_status = usbd_status;
  timer_context->nt_status = nt_status;
  timer_context->complete_with_usbd_status = complete_with_usbd_status;
  timer_context->queued_frame_type = queued_frame_type;
  timer_context->queued_frame_length = queued_frame_length;
  timer_context->queue_frame_on_completion =
      queued_frame_payload != NULL && queued_frame_length > 0;
  if (timer_context->queue_frame_on_completion) {
    RtlCopyMemory(timer_context->queued_frame_payload, queued_frame_payload,
                  queued_frame_length);
  }
  InterlockedIncrement(&device_context->delayed_iso_urb_count);
  due_time = -((LONGLONG)delay_us * 10);
  WdfTimerStart(timer, due_time);
  return TRUE;
}

static VOID VdsQueueInterfaceEvent(WDFDEVICE device, ULONG port_index,
                                   UCHAR interface_number, UCHAR alt_setting,
                                   UCHAR interface_kind) {
  struct vds_usb_interface_event event;

  RtlZeroMemory(&event, sizeof(event));
  event.interface_number = interface_number;
  event.altsetting = alt_setting;
  event.interface_kind = interface_kind;
  (VOID) VdsQueueFrame(device, port_index, VDS_FRAME_USB_INTERFACE,
                       (const UCHAR *)&event, sizeof(event));
}

static VOID VdsUpdateFeatureCache(PVDS_PORT_STATE port_state,
                                  const UCHAR *payload, ULONG payload_size) {
  UCHAR report_id;
  ULONG cache_size;
  KIRQL old_irql;

  if (payload == NULL || payload_size == 0) {
    return;
  }

  report_id = payload[0];
  cache_size = min(payload_size, (ULONG)VDS_HID_FEATURE_REPORT_SIZE);
  KeAcquireSpinLock(&port_state->hid_state_lock, &old_irql);
  RtlZeroMemory(port_state->feature_cache[report_id],
                sizeof(port_state->feature_cache[report_id]));
  RtlCopyMemory(port_state->feature_cache[report_id], payload, cache_size);
  port_state->feature_cache_valid[report_id] = TRUE;
  KeReleaseSpinLock(&port_state->hid_state_lock, old_irql);
}

static BOOLEAN VdsFeatureCacheValid(PVDS_PORT_STATE port_state,
                                    UCHAR report_id) {
  BOOLEAN valid;
  KIRQL old_irql;

  KeAcquireSpinLock(&port_state->hid_state_lock, &old_irql);
  valid = port_state->feature_cache_valid[report_id];
  KeReleaseSpinLock(&port_state->hid_state_lock, old_irql);
  return valid;
}

static ULONG VdsCopyFeatureReport(PVDS_PORT_STATE port_state, UCHAR report_id,
                                  UCHAR *buffer, ULONG buffer_length) {
  ULONG copy_size;
  KIRQL old_irql;

  if (buffer == NULL || buffer_length == 0) {
    return 0;
  }

  copy_size = min(buffer_length, (ULONG)VDS_HID_FEATURE_REPORT_SIZE);
  RtlZeroMemory(buffer, copy_size);
  buffer[0] = report_id;

  KeAcquireSpinLock(&port_state->hid_state_lock, &old_irql);
  if (port_state->feature_cache_valid[report_id]) {
    RtlCopyMemory(buffer, port_state->feature_cache[report_id], copy_size);
  }
  KeReleaseSpinLock(&port_state->hid_state_lock, old_irql);
  return copy_size;
}

static ULONG VdsCopyInputReport(PVDS_PORT_STATE port_state, UCHAR *buffer,
                                ULONG buffer_length) {
  ULONG copy_size;
  KIRQL old_irql;

  if (buffer == NULL || buffer_length == 0) {
    return 0;
  }

  copy_size = min(buffer_length, (ULONG)sizeof(port_state->last_hid_input));
  KeAcquireSpinLock(&port_state->hid_state_lock, &old_irql);
  RtlCopyMemory(buffer, port_state->last_hid_input, copy_size);
  KeReleaseSpinLock(&port_state->hid_state_lock, old_irql);
  return copy_size;
}

static VOID VdsStoreInputReport(PVDS_PORT_STATE port_state,
                                const UCHAR *payload, ULONG payload_size) {
  ULONG copy_size;
  KIRQL old_irql;

  if (payload == NULL || payload_size == 0) {
    return;
  }

  copy_size = min(payload_size, (ULONG)sizeof(port_state->last_hid_input));
  KeAcquireSpinLock(&port_state->hid_state_lock, &old_irql);
  RtlZeroMemory(port_state->last_hid_input, sizeof(port_state->last_hid_input));
  RtlCopyMemory(port_state->last_hid_input, payload, copy_size);
  port_state->last_hid_input[0] = VDS_USB_INPUT_REPORT_ID;
  port_state->have_last_hid_input = TRUE;
  KeReleaseSpinLock(&port_state->hid_state_lock, old_irql);
}

static ULONG VdsCopyControlResponse(UCHAR *transfer_buffer,
                                    ULONG transfer_length,
                                    const UCHAR *response,
                                    ULONG response_length,
                                    USHORT requested_length) {
  ULONG bytes_completed;

  if (transfer_buffer == NULL || transfer_length == 0 || response == NULL) {
    return 0;
  }

  bytes_completed = min(transfer_length, (ULONG)requested_length);
  bytes_completed = min(bytes_completed, response_length);
  RtlCopyMemory(transfer_buffer, response, bytes_completed);
  return bytes_completed;
}

static ULONG VdsCopyStringDescriptor(UCHAR *transfer_buffer,
                                     ULONG transfer_length, const CHAR *string,
                                     USHORT requested_length) {
  UCHAR descriptor[255];
  ULONG length;
  ULONG index;

  if (string == NULL) {
    return VdsCopyControlResponse(
        transfer_buffer, transfer_length, vds_usb_language_descriptor,
        sizeof(vds_usb_language_descriptor), requested_length);
  }

  length = 2;
  for (index = 0; string[index] != '\0'; ++index) {
    if (length + 2 > sizeof(descriptor)) {
      break;
    }
    descriptor[length++] = (UCHAR)string[index];
    descriptor[length++] = 0x00;
  }

  descriptor[0] = (UCHAR)length;
  descriptor[1] = VDS_USB_DESCRIPTOR_TYPE_STRING;
  return VdsCopyControlResponse(transfer_buffer, transfer_length, descriptor,
                                length, requested_length);
}

static VOID VdsEvtControlUrb(WDFQUEUE queue, WDFREQUEST request,
                             size_t output_buffer_length,
                             size_t input_buffer_length,
                             ULONG io_control_code) {
  PVDS_ENDPOINT_QUEUE_CONTEXT context;
  PVDS_DEVICE_CONTEXT device_context;
  PVDS_PORT_STATE port_state;
  WDF_USB_CONTROL_SETUP_PACKET setup_packet;
  PUCHAR transfer_buffer = NULL;
  ULONG transfer_length = 0;
  ULONG bytes_completed = 0;
  UCHAR interface_number;
  UCHAR report_id;
  UCHAR report_type;
  NTSTATUS status;

  UNREFERENCED_PARAMETER(output_buffer_length);
  UNREFERENCED_PARAMETER(input_buffer_length);

  context = VdsGetEndpointQueueContext(queue);
  if (io_control_code != IOCTL_INTERNAL_USB_SUBMIT_URB) {
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        STATUS_INVALID_DEVICE_REQUEST, FALSE);
    return;
  }

  status = UdecxUrbRetrieveControlSetupPacket(request, &setup_packet);
  if (!NT_SUCCESS(status)) {
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        status, FALSE);
    return;
  }

  status = UdecxUrbRetrieveBuffer(request, &transfer_buffer, &transfer_length);
  if (!NT_SUCCESS(status)) {
    status = STATUS_SUCCESS;
    transfer_length = 0;
  }

  context = VdsGetEndpointQueueContext(queue);
  device_context = VdsGetDeviceContext(context->device);
  if (context->port_index >= device_context->max_port) {
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        STATUS_DEVICE_NOT_READY, FALSE);
    return;
  }
  port_state = &device_context->port_state[context->port_index];
  interface_number = (UCHAR)(setup_packet.Packet.wIndex.Value & 0xff);
  report_id = setup_packet.Packet.wValue.Bytes.LowByte;
  report_type = setup_packet.Packet.wValue.Bytes.HiByte;

  if (transfer_buffer != NULL && transfer_length > 0 &&
      setup_packet.Packet.bm.Request.Dir == BmRequestDeviceToHost) {
    RtlZeroMemory(transfer_buffer,
                  min(transfer_length, (ULONG)setup_packet.Packet.wLength));
  }

  if (setup_packet.Packet.bm.Request.Dir == BmRequestDeviceToHost &&
      setup_packet.Packet.bm.Request.Type == BmRequestStandard &&
      setup_packet.Packet.bRequest == VDS_USB_REQUEST_GET_DESCRIPTOR &&
      report_type == VDS_USB_DESCRIPTOR_TYPE_STRING) {
    if (report_id == 0) {
      bytes_completed = VdsCopyStringDescriptor(
          transfer_buffer, transfer_length, NULL, setup_packet.Packet.wLength);
    } else if (report_id == 1) {
      bytes_completed = VdsCopyStringDescriptor(
          transfer_buffer, transfer_length, VDS_USB_MANUFACTURER_STRING,
          setup_packet.Packet.wLength);
    } else if (report_id == 2) {
      bytes_completed = VdsCopyStringDescriptor(
          transfer_buffer, transfer_length,
          VdsProductStringForProfile(port_state->profile),
          setup_packet.Packet.wLength);
    }
  } else if (setup_packet.Packet.bm.Request.Dir == BmRequestDeviceToHost &&
             setup_packet.Packet.bm.Request.Type == BmRequestStandard &&
             setup_packet.Packet.bm.Request.Recipient == BmRequestToInterface &&
             setup_packet.Packet.bRequest == VDS_USB_REQUEST_GET_DESCRIPTOR &&
             interface_number == VDS_USB_HID_INTERFACE) {
    if (report_type == VDS_USB_DESCRIPTOR_TYPE_HID_REPORT) {
      VDS_DESCRIPTOR_VIEW hid_report_descriptor;

      hid_report_descriptor =
          VdsHidReportDescriptorForProfile(port_state->profile);
      bytes_completed = VdsCopyControlResponse(
          transfer_buffer, transfer_length, hid_report_descriptor.data,
          hid_report_descriptor.size, setup_packet.Packet.wLength);
    } else if (report_type == VDS_USB_DESCRIPTOR_TYPE_HID) {
      VDS_DESCRIPTOR_VIEW hid_descriptor;

      hid_descriptor = VdsHidDescriptorForProfile(port_state->profile);
      bytes_completed = VdsCopyControlResponse(
          transfer_buffer, transfer_length, hid_descriptor.data,
          hid_descriptor.size, setup_packet.Packet.wLength);
    }
  } else if (setup_packet.Packet.bm.Request.Type == BmRequestClass &&
             setup_packet.Packet.bm.Request.Recipient == BmRequestToInterface &&
             interface_number == VDS_USB_HID_INTERFACE) {
    if (port_state == NULL) {
      status = STATUS_DEVICE_NOT_READY;
    } else if (setup_packet.Packet.bRequest == VDS_USB_HID_GET_REPORT &&
               setup_packet.Packet.bm.Request.Dir == BmRequestDeviceToHost) {
      if (report_type == VDS_USB_HID_REPORT_TYPE_INPUT) {
        bytes_completed = VdsCopyInputReport(
            port_state, transfer_buffer,
            min(transfer_length, (ULONG)setup_packet.Packet.wLength));
      } else if (report_type == VDS_USB_HID_REPORT_TYPE_FEATURE) {
        if (!VdsFeatureCacheValid(port_state, report_id)) {
          (VOID) VdsQueueFrame(context->device, context->port_index,
                               VDS_FRAME_USB_FEATURE_GET, &report_id,
                               sizeof(report_id));
        }
        bytes_completed = VdsCopyFeatureReport(
            port_state, report_id, transfer_buffer,
            min(transfer_length, (ULONG)setup_packet.Packet.wLength));
      } else if (report_type == VDS_USB_HID_REPORT_TYPE_OUTPUT &&
                 transfer_buffer != NULL && transfer_length > 0) {
        transfer_buffer[0] = report_id;
        bytes_completed =
            min(transfer_length, (ULONG)setup_packet.Packet.wLength);
      }
    } else if (setup_packet.Packet.bRequest == VDS_USB_HID_SET_REPORT &&
               setup_packet.Packet.bm.Request.Dir == BmRequestHostToDevice) {
      ULONG payload_size;

      payload_size = min(transfer_length, (ULONG)setup_packet.Packet.wLength);
      if (report_type == VDS_USB_HID_REPORT_TYPE_FEATURE) {
        VdsUpdateFeatureCache(port_state, transfer_buffer, payload_size);
        (VOID) VdsQueueFrame(context->device, context->port_index,
                             VDS_FRAME_USB_FEATURE_SET, transfer_buffer,
                             payload_size);
      } else if (report_type == VDS_USB_HID_REPORT_TYPE_OUTPUT) {
        (VOID)
            VdsQueueFrame(context->device, context->port_index,
                          VDS_FRAME_USB_HID_OUT, transfer_buffer, payload_size);
      }
      bytes_completed = payload_size;
    } else if (setup_packet.Packet.bRequest == VDS_USB_HID_GET_IDLE ||
               setup_packet.Packet.bRequest == VDS_USB_HID_GET_PROTOCOL) {
      if (transfer_buffer != NULL && transfer_length > 0) {
        transfer_buffer[0] = 0;
        bytes_completed = 1;
      }
    } else if (setup_packet.Packet.bRequest == VDS_USB_HID_SET_IDLE ||
               setup_packet.Packet.bRequest == VDS_USB_HID_SET_PROTOCOL) {
      bytes_completed = 0;
    }
  } else if (transfer_buffer != NULL && transfer_length > 0) {
    bytes_completed = transfer_length < setup_packet.Packet.wLength
                          ? transfer_length
                          : setup_packet.Packet.wLength;

    if (setup_packet.Packet.bm.Request.Dir == BmRequestDeviceToHost &&
        setup_packet.Packet.bm.Request.Type == BmRequestClass &&
        setup_packet.Packet.bm.Request.Recipient == BmRequestToEndpoint &&
        setup_packet.Packet.wValue.Bytes.HiByte == 0x01 &&
        bytes_completed >= 3) {
      transfer_buffer[0] = 0x80;
      transfer_buffer[1] = 0xbb;
      transfer_buffer[2] = 0x00;
      bytes_completed = 3;
    }
  }

  KdPrint(("vds_usb: EP0 class request bm=0x%02x b=0x%02x "
           "wValue=0x%04x wIndex=0x%04x wLength=%u complete=%lu\n",
           setup_packet.Packet.bm.Byte, setup_packet.Packet.bRequest,
           setup_packet.Packet.wValue.Value, setup_packet.Packet.wIndex.Value,
           setup_packet.Packet.wLength, bytes_completed));

  InterlockedIncrement(&device_context->control_urb_count);
  InterlockedExchange(&device_context->last_control_bm_request,
                      setup_packet.Packet.bm.Byte);
  InterlockedExchange(&device_context->last_control_b_request,
                      setup_packet.Packet.bRequest);
  InterlockedExchange(&device_context->last_control_w_value,
                      setup_packet.Packet.wValue.Value);
  InterlockedExchange(&device_context->last_control_w_index,
                      setup_packet.Packet.wIndex.Value);
  InterlockedExchange(&device_context->last_control_w_length,
                      setup_packet.Packet.wLength);
  InterlockedExchange(&device_context->last_control_bytes_completed,
                      (LONG)bytes_completed);

  UdecxUrbSetBytesCompleted(request, bytes_completed);
  if (NT_SUCCESS(status)) {
    UdecxUrbComplete(request, USBD_STATUS_SUCCESS);
  } else {
    UdecxUrbCompleteWithNtStatus(request, status);
  }
}

static PVOID VdsIsoTransferBuffer(PURB urb) {
  PVOID transfer_buffer;

  if (urb == NULL) {
    return NULL;
  }

  transfer_buffer = urb->UrbIsochronousTransfer.TransferBuffer;
  if (transfer_buffer == NULL &&
      urb->UrbIsochronousTransfer.TransferBufferMDL != NULL) {
    transfer_buffer = MmGetSystemAddressForMdlSafe(
        urb->UrbIsochronousTransfer.TransferBufferMDL, NormalPagePriority);
  }

  return transfer_buffer;
}

static VOID VdsRecordIsoPcmSamples(PVDS_DEVICE_CONTEXT device_context, PURB urb,
                                   ULONG transfer_length, ULONG request_count) {
  const SHORT *samples;
  ULONG channel;
  ULONG frame;
  ULONG frame_count;
  LONG peaks[VDS_PCM_CHANNELS] = {};

  samples = (const SHORT *)VdsIsoTransferBuffer(urb);
  if (samples == NULL || transfer_length < VDS_PCM_CHANNELS * sizeof(SHORT)) {
    return;
  }

  frame_count = transfer_length / (VDS_PCM_CHANNELS * sizeof(SHORT));
  InterlockedExchange(&device_context->last_pcm_frame_count, (LONG)frame_count);
  for (channel = 0; channel < VDS_PCM_CHANNELS; ++channel) {
    InterlockedExchange(&device_context->last_pcm_sample[channel],
                        samples[channel]);
  }

  for (frame = 0; frame < frame_count; ++frame) {
    for (channel = 0; channel < VDS_PCM_CHANNELS; ++channel) {
      LONG sample_value = samples[frame * VDS_PCM_CHANNELS + channel];
      LONG magnitude = sample_value < 0 ? -sample_value : sample_value;

      if (magnitude > peaks[channel]) {
        peaks[channel] = magnitude;
      }
    }
  }

  for (channel = 0; channel < VDS_PCM_CHANNELS; ++channel) {
    InterlockedExchange(&device_context->last_pcm_peak[channel],
                        peaks[channel]);
  }

  if (request_count <= 16 || (request_count % 1000) == 0) {
    KdPrint(("vds_usb: PCM frames=%lu first=[%ld,%ld,%ld,%ld] "
             "peak=[%ld,%ld,%ld,%ld]\n",
             frame_count, samples[0], samples[1], samples[2], samples[3],
             peaks[0], peaks[1], peaks[2], peaks[3]));
  }
}

static VOID VdsEvtIsoOutUrb(WDFQUEUE queue, WDFREQUEST request,
                            size_t output_buffer_length,
                            size_t input_buffer_length, ULONG io_control_code) {
  PVDS_ENDPOINT_QUEUE_CONTEXT context;
  PIO_STACK_LOCATION irp_stack;
  PURB urb;
  PUCHAR transfer_buffer;
  ULONG transfer_length;
  NTSTATUS status;

  UNREFERENCED_PARAMETER(output_buffer_length);
  UNREFERENCED_PARAMETER(input_buffer_length);

  if (io_control_code != IOCTL_INTERNAL_USB_SUBMIT_URB) {
    context = VdsGetEndpointQueueContext(queue);
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        STATUS_INVALID_DEVICE_REQUEST, FALSE);
    return;
  }

  context = VdsGetEndpointQueueContext(queue);
  irp_stack = IoGetCurrentIrpStackLocation(WdfRequestWdmGetIrp(request));
  urb = (PURB)irp_stack->Parameters.Others.Argument1;
  if (urb != NULL && urb->UrbHeader.Function != URB_FUNCTION_ISOCH_TRANSFER) {
    PVDS_DEVICE_CONTEXT device_context;

    device_context = VdsGetDeviceContext(context->device);
    InterlockedIncrement(&device_context->non_iso_urb_count);
    InterlockedExchange(&device_context->last_non_iso_function,
                        urb->UrbHeader.Function);
  }

  if (urb != NULL && urb->UrbHeader.Function == URB_FUNCTION_ISOCH_TRANSFER) {
    PVDS_DEVICE_CONTEXT device_context;
    ULONG iso_delay_us;
    ULONG packet;

    device_context = VdsGetDeviceContext(context->device);
    transfer_length = urb->UrbIsochronousTransfer.TransferBufferLength;
    ++context->request_count;
    context->byte_count += transfer_length;
    InterlockedIncrement(&device_context->iso_out_request_count);
    InterlockedExchangeAdd(&device_context->iso_out_byte_count,
                           (LONG)transfer_length);
    InterlockedExchange(&device_context->last_iso_packets,
                        urb->UrbIsochronousTransfer.NumberOfPackets);
    InterlockedExchange(&device_context->last_iso_length,
                        (LONG)transfer_length);
    transfer_buffer = (PUCHAR)VdsIsoTransferBuffer(urb);
    VdsRecordIsoPcmSamples(device_context, urb, transfer_length,
                           context->request_count);
    iso_delay_us = urb->UrbIsochronousTransfer.NumberOfPackets * 1000;
    if (iso_delay_us == 0) {
      iso_delay_us = 1000;
    }
    iso_delay_us = min(iso_delay_us, vds_iso_out_delay_max_us);
    if (iso_delay_us > 1000 + vds_iso_out_delay_slack_compensation_us) {
      iso_delay_us -= vds_iso_out_delay_slack_compensation_us;
    }

    urb->UrbIsochronousTransfer.ErrorCount = 0;
    for (packet = 0; packet < urb->UrbIsochronousTransfer.NumberOfPackets;
         ++packet) {
      ULONG packet_offset;
      ULONG next_offset;

      packet_offset = urb->UrbIsochronousTransfer.IsoPacket[packet].Offset;
      next_offset =
          packet + 1 < urb->UrbIsochronousTransfer.NumberOfPackets
              ? urb->UrbIsochronousTransfer.IsoPacket[packet + 1].Offset
              : transfer_length;

      urb->UrbIsochronousTransfer.IsoPacket[packet].Length =
          next_offset > packet_offset ? next_offset - packet_offset : 0;
      urb->UrbIsochronousTransfer.IsoPacket[packet].Status =
          USBD_STATUS_SUCCESS;
    }

    urb->UrbHeader.Status = USBD_STATUS_SUCCESS;
    if (context->request_count <= 32 || (context->request_count % 1000) == 0) {
      KdPrint(("vds_usb: ISO OUT ep=0x%02x request=%lu length=%lu "
               "packets=%lu delay_us=%lu total=%llu\n",
               context->endpoint_address, context->request_count,
               transfer_length, urb->UrbIsochronousTransfer.NumberOfPackets,
               iso_delay_us, context->byte_count));
    }

    /*
     * Audio ISO packet descriptors represent 1 ms USB frames here. Pacing the
     * URB completion keeps Windows from submitting several seconds of PCM as a
     * burst, which would overflow the userspace Bluetooth 0x36 queue. WDF timer
     * completion has a small positive slack on this VM, so subtract a measured
     * compensation before converting to the 100 ns relative timeout unit.
     */
    if (!VdsCompleteUrbAfterDelay(
            context->device, context->port_index, request, transfer_length,
            USBD_STATUS_SUCCESS, STATUS_SUCCESS, TRUE, iso_delay_us,
            VDS_FRAME_USB_AUDIO_OUT, transfer_buffer, transfer_length)) {
      if (transfer_buffer != NULL && transfer_length > 0) {
        (VOID) VdsQueueFrame(context->device, context->port_index,
                             VDS_FRAME_USB_AUDIO_OUT, transfer_buffer,
                             transfer_length);
      }
      VdsCompleteUrbAsync(context->device, request, transfer_length,
                          USBD_STATUS_SUCCESS, STATUS_SUCCESS, TRUE);
    }
    return;
  }

  status = UdecxUrbRetrieveBuffer(request, &transfer_buffer, &transfer_length);
  if (NT_SUCCESS(status)) {
    ++context->request_count;
    context->byte_count += transfer_length;

    if (context->request_count <= 32 || (context->request_count % 1000) == 0) {
      KdPrint(("vds_usb: OUT ep=0x%02x request=%lu length=%lu "
               "total=%llu first=%02x\n",
               context->endpoint_address, context->request_count,
               transfer_length, context->byte_count,
               transfer_length > 0 ? transfer_buffer[0] : 0));
    }
  } else {
    KdPrint(("vds_usb: OUT ep=0x%02x buffer unavailable status=0x%08lx\n",
             context->endpoint_address, status));
    status = STATUS_SUCCESS;
    transfer_length = 0;
  }

  VdsCompleteUrbAsync(context->device, request, transfer_length,
                      USBD_STATUS_SUCCESS, status, FALSE);
}

static VOID VdsEvtIsoInUrb(WDFQUEUE queue, WDFREQUEST request,
                           size_t output_buffer_length,
                           size_t input_buffer_length, ULONG io_control_code) {
  PVDS_ENDPOINT_QUEUE_CONTEXT context;
  PIO_STACK_LOCATION irp_stack;
  PURB urb;
  PVOID transfer_buffer;
  ULONG transfer_length;
  ULONG packet;

  UNREFERENCED_PARAMETER(output_buffer_length);
  UNREFERENCED_PARAMETER(input_buffer_length);

  context = VdsGetEndpointQueueContext(queue);
  if (io_control_code != IOCTL_INTERNAL_USB_SUBMIT_URB) {
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        STATUS_INVALID_DEVICE_REQUEST, FALSE);
    return;
  }

  irp_stack = IoGetCurrentIrpStackLocation(WdfRequestWdmGetIrp(request));
  urb = (PURB)irp_stack->Parameters.Others.Argument1;
  if (urb == NULL || urb->UrbHeader.Function != URB_FUNCTION_ISOCH_TRANSFER) {
    PVDS_DEVICE_CONTEXT device_context;

    device_context = VdsGetDeviceContext(context->device);
    InterlockedIncrement(&device_context->non_iso_urb_count);
    InterlockedExchange(&device_context->last_non_iso_function,
                        urb != NULL ? (LONG)urb->UrbHeader.Function
                                    : (LONG)0xffffffff);
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        STATUS_SUCCESS, FALSE);
    return;
  }

  transfer_length = urb->UrbIsochronousTransfer.TransferBufferLength;
  transfer_buffer = urb->UrbIsochronousTransfer.TransferBuffer;
  if (transfer_buffer == NULL &&
      urb->UrbIsochronousTransfer.TransferBufferMDL != NULL) {
    transfer_buffer = MmGetSystemAddressForMdlSafe(
        urb->UrbIsochronousTransfer.TransferBufferMDL, NormalPagePriority);
  }
  if (transfer_buffer != NULL && transfer_length > 0) {
    RtlZeroMemory(transfer_buffer, transfer_length);
  }

  ++context->request_count;
  context->byte_count += transfer_length;
  urb->UrbIsochronousTransfer.ErrorCount = 0;
  for (packet = 0; packet < urb->UrbIsochronousTransfer.NumberOfPackets;
       ++packet) {
    ULONG packet_offset;
    ULONG next_offset;

    packet_offset = urb->UrbIsochronousTransfer.IsoPacket[packet].Offset;
    next_offset = packet + 1 < urb->UrbIsochronousTransfer.NumberOfPackets
                      ? urb->UrbIsochronousTransfer.IsoPacket[packet + 1].Offset
                      : transfer_length;

    urb->UrbIsochronousTransfer.IsoPacket[packet].Length =
        next_offset > packet_offset ? next_offset - packet_offset : 0;
    urb->UrbIsochronousTransfer.IsoPacket[packet].Status = USBD_STATUS_SUCCESS;
  }

  urb->UrbHeader.Status = USBD_STATUS_SUCCESS;
  if (context->request_count <= 16 || (context->request_count % 1000) == 0) {
    KdPrint(("vds_usb: ISO IN ep=0x%02x request=%lu length=%lu "
             "packets=%lu total=%llu\n",
             context->endpoint_address, context->request_count, transfer_length,
             urb->UrbIsochronousTransfer.NumberOfPackets, context->byte_count));
  }

  VdsCompleteUrbAsync(context->device, request, transfer_length,
                      USBD_STATUS_SUCCESS, STATUS_SUCCESS, TRUE);
}

static VOID VdsEvtHidOutUrb(WDFQUEUE queue, WDFREQUEST request,
                            size_t output_buffer_length,
                            size_t input_buffer_length, ULONG io_control_code) {
  PVDS_ENDPOINT_QUEUE_CONTEXT context;
  PUCHAR transfer_buffer;
  ULONG transfer_length;
  NTSTATUS status;

  UNREFERENCED_PARAMETER(output_buffer_length);
  UNREFERENCED_PARAMETER(input_buffer_length);

  context = VdsGetEndpointQueueContext(queue);
  if (io_control_code != IOCTL_INTERNAL_USB_SUBMIT_URB) {
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        STATUS_INVALID_DEVICE_REQUEST, FALSE);
    return;
  }

  status = UdecxUrbRetrieveBuffer(request, &transfer_buffer, &transfer_length);
  if (!NT_SUCCESS(status)) {
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        status, FALSE);
    return;
  }

  ++context->request_count;
  context->byte_count += transfer_length;
  if (transfer_length > 0) {
    (VOID)
        VdsQueueFrame(context->device, context->port_index,
                      VDS_FRAME_USB_HID_OUT, transfer_buffer, transfer_length);
  }

  if (context->request_count <= 32 || (context->request_count % 1024) == 0) {
    KdPrint(("vds_usb: HID OUT ep=0x%02x request=%lu length=%lu "
             "total=%llu first=%02x\n",
             context->endpoint_address, context->request_count, transfer_length,
             context->byte_count,
             transfer_length > 0 ? transfer_buffer[0] : 0));
  }

  VdsCompleteUrbAsync(context->device, request, transfer_length,
                      USBD_STATUS_SUCCESS, STATUS_SUCCESS, TRUE);
}

static VOID VdsEvtHidInUrb(WDFQUEUE queue, WDFREQUEST request,
                           size_t output_buffer_length,
                           size_t input_buffer_length, ULONG io_control_code) {
  PVDS_ENDPOINT_QUEUE_CONTEXT context;
  PVDS_DEVICE_CONTEXT device_context;
  PVDS_PORT_STATE port_state;
  PUCHAR transfer_buffer;
  ULONG transfer_length;
  ULONG bytes_completed;
  NTSTATUS status;

  UNREFERENCED_PARAMETER(output_buffer_length);
  UNREFERENCED_PARAMETER(input_buffer_length);

  context = VdsGetEndpointQueueContext(queue);
  if (io_control_code != IOCTL_INTERNAL_USB_SUBMIT_URB) {
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        STATUS_INVALID_DEVICE_REQUEST, FALSE);
    return;
  }

  status = UdecxUrbRetrieveBuffer(request, &transfer_buffer, &transfer_length);
  if (!NT_SUCCESS(status)) {
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        status, FALSE);
    return;
  }

  device_context = VdsGetDeviceContext(context->device);
  if (context->port_index >= device_context->max_port) {
    VdsCompleteUrbAsync(context->device, request, 0, USBD_STATUS_SUCCESS,
                        STATUS_DEVICE_NOT_READY, FALSE);
    return;
  }
  port_state = &device_context->port_state[context->port_index];

  bytes_completed =
      VdsCopyInputReport(port_state, transfer_buffer, transfer_length);
  ++context->request_count;
  context->byte_count += bytes_completed;
  if (context->request_count <= 32 || (context->request_count % 1024) == 0) {
    KdPrint(("vds_usb: HID IN ep=0x%02x request=%lu length=%lu "
             "total=%llu first=%02x\n",
             context->endpoint_address, context->request_count, bytes_completed,
             context->byte_count,
             bytes_completed > 0 ? transfer_buffer[0] : 0));
  }

  if (!VdsCompleteUrbAfterDelay(context->device, context->port_index, request,
                                bytes_completed, USBD_STATUS_SUCCESS,
                                STATUS_SUCCESS, TRUE, 4, 0, NULL, 0)) {
    VdsCompleteUrbAsync(context->device, request, bytes_completed,
                        USBD_STATUS_SUCCESS, STATUS_SUCCESS, TRUE);
  }
}

static NTSTATUS VdsCreateEndpointQueue(
    WDFDEVICE device, ULONG port_index, UCHAR endpoint_address,
    PFN_WDF_IO_QUEUE_IO_INTERNAL_DEVICE_CONTROL evt_io_internal_device_control,
    WDFQUEUE *queue) {
  WDF_OBJECT_ATTRIBUTES attributes;
  WDF_IO_QUEUE_CONFIG queue_config;
  PVDS_ENDPOINT_QUEUE_CONTEXT context;
  NTSTATUS status;

  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes,
                                          VDS_ENDPOINT_QUEUE_CONTEXT);
  WDF_IO_QUEUE_CONFIG_INIT(&queue_config, WdfIoQueueDispatchSequential);
  queue_config.EvtIoInternalDeviceControl = evt_io_internal_device_control;
  queue_config.PowerManaged = WdfFalse;

  status = WdfIoQueueCreate(device, &queue_config, &attributes, queue);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  context = VdsGetEndpointQueueContext(*queue);
  context->device = device;
  context->port_index = port_index;
  context->endpoint_address = endpoint_address;
  context->request_count = 0;
  context->byte_count = 0;
  return STATUS_SUCCESS;
}

static NTSTATUS VdsAssignFreshEndpointQueue(UDECXUSBENDPOINT endpoint) {
  PVDS_UDECX_ENDPOINT_CONTEXT endpoint_context;
  PVDS_DEVICE_CONTEXT device_context;
  WDFQUEUE queue;
  NTSTATUS status;

  endpoint_context = VdsGetUdecxEndpointContext(endpoint);
  device_context = VdsGetDeviceContext(endpoint_context->device);

  status = VdsCreateEndpointQueue(
      endpoint_context->device, endpoint_context->port_index,
      endpoint_context->endpoint_address,
      endpoint_context->evt_io_internal_device_control, &queue);
  if (!NT_SUCCESS(status)) {
    InterlockedIncrement(&device_context->endpoint_queue_refresh_failure_count);
    KdPrint(("vds_usb: fresh queue create failed ep=0x%02x "
             "status=0x%08lx\n",
             endpoint_context->endpoint_address, status));
    return status;
  }

  UdecxUsbEndpointSetWdfIoQueue(endpoint, queue);
  endpoint_context->queue = queue;
  WdfIoQueueStart(queue);
  InterlockedIncrement(&device_context->endpoint_queue_refresh_count);
  KdPrint(("vds_usb: fresh queue assigned ep=0x%02x\n",
           endpoint_context->endpoint_address));
  return STATUS_SUCCESS;
}

static NTSTATUS VdsCreateUrbCompletionObjects(WDFDEVICE device) {
  PVDS_DEVICE_CONTEXT device_context;
  PVDS_URB_COMPLETION_DPC_CONTEXT dpc_context;
  WDF_DPC_CONFIG dpc_config;
  WDF_IO_QUEUE_CONFIG queue_config;
  WDF_OBJECT_ATTRIBUTES attributes;
  NTSTATUS status;

  device_context = VdsGetDeviceContext(device);

  WDF_IO_QUEUE_CONFIG_INIT(&queue_config, WdfIoQueueDispatchManual);
  queue_config.PowerManaged = WdfFalse;
  status = WdfIoQueueCreate(device, &queue_config, WDF_NO_OBJECT_ATTRIBUTES,
                            &device_context->urb_completion_queue);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  WDF_DPC_CONFIG_INIT(&dpc_config, VdsEvtCompleteUrbDpc);
  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes,
                                          VDS_URB_COMPLETION_DPC_CONTEXT);
  attributes.ParentObject = device;
  status = WdfDpcCreate(&dpc_config, &attributes,
                        &device_context->urb_completion_dpc);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  dpc_context =
      VdsGetUrbCompletionDpcContext(device_context->urb_completion_dpc);
  dpc_context->device = device;
  return STATUS_SUCCESS;
}

static NTSTATUS VdsEvtDefaultEndpointAdd(UDECXUSBDEVICE usb_device,
                                         PUDECXUSBENDPOINT_INIT endpoint_init) {
  PVDS_UDECX_DEVICE_CONTEXT device_context;
  PVDS_UDECX_ENDPOINT_CONTEXT endpoint_context;
  WDF_OBJECT_ATTRIBUTES attributes;
  UDECX_USB_ENDPOINT_CALLBACKS callbacks;
  UDECXUSBENDPOINT endpoint;
  NTSTATUS status;

  device_context = VdsGetUdecxDeviceContext(usb_device);

  UdecxUsbEndpointInitSetEndpointAddress(endpoint_init, 0x00);
  UDECX_USB_ENDPOINT_CALLBACKS_INIT(&callbacks, VdsEvtEndpointReset);
  UdecxUsbEndpointInitSetCallbacks(endpoint_init, &callbacks);

  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes,
                                          VDS_UDECX_ENDPOINT_CONTEXT);
  status = UdecxUsbEndpointCreate(&endpoint_init, &attributes, &endpoint);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  endpoint_context = VdsGetUdecxEndpointContext(endpoint);
  endpoint_context->device = device_context->wdf_device;
  endpoint_context->port_index = device_context->port_index;
  endpoint_context->queue = NULL;
  endpoint_context->endpoint_address = 0x00;
  endpoint_context->evt_io_internal_device_control = VdsEvtControlUrb;
  return VdsAssignFreshEndpointQueue(endpoint);
}

static NTSTATUS
VdsEvtEndpointAdd(UDECXUSBDEVICE usb_device,
                  PUDECX_USB_ENDPOINT_INIT_AND_METADATA endpoint_to_create) {
  PVDS_UDECX_DEVICE_CONTEXT device_context;
  PVDS_UDECX_ENDPOINT_CONTEXT endpoint_context;
  PUSB_ENDPOINT_DESCRIPTOR descriptor;
  WDF_OBJECT_ATTRIBUTES attributes;
  UDECX_USB_ENDPOINT_CALLBACKS callbacks;
  UDECXUSBENDPOINT endpoint;
  NTSTATUS status;

  device_context = VdsGetUdecxDeviceContext(usb_device);
  descriptor = endpoint_to_create->EndpointDescriptor;

  UDECX_USB_ENDPOINT_CALLBACKS_INIT(&callbacks, VdsEvtEndpointReset);
  UdecxUsbEndpointInitSetCallbacks(endpoint_to_create->UdecxUsbEndpointInit,
                                   &callbacks);

  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes,
                                          VDS_UDECX_ENDPOINT_CONTEXT);
  status = UdecxUsbEndpointCreate(&endpoint_to_create->UdecxUsbEndpointInit,
                                  &attributes, &endpoint);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  endpoint_context = VdsGetUdecxEndpointContext(endpoint);
  endpoint_context->device = device_context->wdf_device;
  endpoint_context->port_index = device_context->port_index;
  endpoint_context->queue = NULL;
  endpoint_context->endpoint_address = descriptor->bEndpointAddress;
  if (descriptor->bEndpointAddress == VDS_USB_HID_IN_ENDPOINT) {
    endpoint_context->evt_io_internal_device_control = VdsEvtHidInUrb;
  } else if (descriptor->bEndpointAddress == VDS_USB_HID_OUT_ENDPOINT) {
    endpoint_context->evt_io_internal_device_control = VdsEvtHidOutUrb;
  } else {
    endpoint_context->evt_io_internal_device_control =
        (descriptor->bEndpointAddress & 0x80) != 0 ? VdsEvtIsoInUrb
                                                   : VdsEvtIsoOutUrb;
  }
  status = VdsAssignFreshEndpointQueue(endpoint);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  KdPrint(("vds_usb: endpoint added 0x%02x attributes=0x%02x\n",
           descriptor->bEndpointAddress, descriptor->bmAttributes));
  return STATUS_SUCCESS;
}

static VOID VdsEvtEndpointsConfigure(UDECXUSBDEVICE usb_device,
                                     WDFREQUEST request,
                                     PUDECX_ENDPOINTS_CONFIGURE_PARAMS params) {
  PVDS_UDECX_DEVICE_CONTEXT udecx_context;
  PVDS_DEVICE_CONTEXT device_context;
  PVDS_CONFIGURE_RECORD configure_record;
  LONG configure_sequence;
  ULONG configure_endpoint_addresses;
  ULONG released_endpoint_addresses;
  ULONG endpoint_index;
  NTSTATUS status;

  udecx_context = VdsGetUdecxDeviceContext(usb_device);
  device_context = VdsGetDeviceContext(udecx_context->wdf_device);
  InterlockedIncrement(&device_context->configure_count);
  InterlockedExchangeAdd(&device_context->configure_endpoint_count,
                         (LONG)params->EndpointsToConfigureCount);
  InterlockedExchangeAdd(&device_context->configure_release_count,
                         (LONG)params->ReleasedEndpointsCount);
  InterlockedExchange(&device_context->last_configure_type,
                      (LONG)params->ConfigureType);
  InterlockedExchange(&device_context->last_interface,
                      (LONG)params->InterfaceNumber);
  InterlockedExchange(&device_context->last_alt_setting,
                      (LONG)params->NewInterfaceSetting);
  configure_sequence =
      InterlockedIncrement(&device_context->configure_history_sequence);
  configure_record =
      &device_context->configure_history[(configure_sequence - 1) %
                                         VDS_CONFIGURE_HISTORY_SIZE];
  configure_record->sequence = (ULONG)configure_sequence;
  configure_record->configure_type = params->ConfigureType;
  configure_record->interface_number = params->InterfaceNumber;
  configure_record->alt_setting = params->NewInterfaceSetting;
  configure_record->endpoints_to_configure = params->EndpointsToConfigureCount;
  configure_record->released_endpoints = params->ReleasedEndpointsCount;
  configure_endpoint_addresses = 0;
  for (endpoint_index = 0; endpoint_index < params->EndpointsToConfigureCount &&
                           endpoint_index < sizeof(ULONG);
       ++endpoint_index) {
    PVDS_UDECX_ENDPOINT_CONTEXT endpoint_context;

    endpoint_context = VdsGetUdecxEndpointContext(
        params->EndpointsToConfigure[endpoint_index]);
    configure_endpoint_addresses |= (ULONG)endpoint_context->endpoint_address
                                    << (endpoint_index * 8);
  }
  released_endpoint_addresses = 0;
  for (endpoint_index = 0; endpoint_index < params->ReleasedEndpointsCount &&
                           endpoint_index < sizeof(ULONG);
       ++endpoint_index) {
    PVDS_UDECX_ENDPOINT_CONTEXT endpoint_context;

    endpoint_context =
        VdsGetUdecxEndpointContext(params->ReleasedEndpoints[endpoint_index]);
    released_endpoint_addresses |= (ULONG)endpoint_context->endpoint_address
                                   << (endpoint_index * 8);
  }
  configure_record->configure_endpoint_addresses = configure_endpoint_addresses;
  configure_record->released_endpoint_addresses = released_endpoint_addresses;

  KdPrint(("vds_usb: endpoints configure type=%u interface=%u alt=%u "
           "configure=%lu release=%lu cfg_ep=0x%08lx rel_ep=0x%08lx\n",
           params->ConfigureType, params->InterfaceNumber,
           params->NewInterfaceSetting, params->EndpointsToConfigureCount,
           params->ReleasedEndpointsCount, configure_endpoint_addresses,
           released_endpoint_addresses));

  if (params->InterfaceNumber == 1) {
    VdsQueueInterfaceEvent(udecx_context->wdf_device, udecx_context->port_index,
                           (UCHAR)params->InterfaceNumber,
                           (UCHAR)params->NewInterfaceSetting,
                           VDS_USB_INTERFACE_AUDIO_OUT);
  } else if (params->InterfaceNumber == 2) {
    VdsQueueInterfaceEvent(udecx_context->wdf_device, udecx_context->port_index,
                           (UCHAR)params->InterfaceNumber,
                           (UCHAR)params->NewInterfaceSetting,
                           VDS_USB_INTERFACE_AUDIO_IN);
  } else if (params->InterfaceNumber == VDS_USB_HID_INTERFACE) {
    VdsQueueInterfaceEvent(udecx_context->wdf_device, udecx_context->port_index,
                           (UCHAR)params->InterfaceNumber,
                           (UCHAR)params->NewInterfaceSetting,
                           VDS_USB_INTERFACE_HID);
  }

  /* Endpoint queues are assigned when UdeCx creates each endpoint. */
  status = STATUS_SUCCESS;

  if (NT_SUCCESS(status) && params->ReleasedEndpointsCount > 0) {
    /* Complete release synchronously unless a nonzero delay is selected. */
    if (VdsCompleteConfigureAfterDelay(udecx_context->wdf_device, request,
                                       status, vds_endpoint_release_delay_ms)) {
      return;
    }
  }

  WdfRequestComplete(request, status);
}

static NTSTATUS VdsEvtDeviceLinkPowerEntry(WDFDEVICE device,
                                           UDECXUSBDEVICE usb_device) {
  UNREFERENCED_PARAMETER(device);
  UNREFERENCED_PARAMETER(usb_device);

  return STATUS_SUCCESS;
}

static NTSTATUS
VdsEvtDeviceLinkPowerExit(WDFDEVICE device, UDECXUSBDEVICE usb_device,
                          UDECX_USB_DEVICE_WAKE_SETTING wake_setting) {
  UNREFERENCED_PARAMETER(device);
  UNREFERENCED_PARAMETER(usb_device);
  UNREFERENCED_PARAMETER(wake_setting);

  return STATUS_SUCCESS;
}

static NTSTATUS VdsEvtQueryUsbCapability(WDFDEVICE device,
                                         PGUID capability_type,
                                         ULONG output_buffer_length,
                                         PVOID output_buffer,
                                         PULONG result_length) {
  UNREFERENCED_PARAMETER(device);
  UNREFERENCED_PARAMETER(capability_type);
  UNREFERENCED_PARAMETER(output_buffer_length);
  UNREFERENCED_PARAMETER(output_buffer);

  *result_length = 0;
  return STATUS_NOT_SUPPORTED;
}

static NTSTATUS VdsDeleteUsbChildDevice(WDFDEVICE device, ULONG port_index) {
  PVDS_DEVICE_CONTEXT context;
  PVDS_PORT_STATE port_state;
  UDECXUSBDEVICE usb_device;
  KIRQL old_irql;
  NTSTATUS status;

  context = VdsGetDeviceContext(device);
  if (port_index >= context->max_port) {
    return STATUS_DEVICE_NOT_READY;
  }

  port_state = &context->port_state[port_index];
  usb_device = port_state->usb_device;
  if (usb_device == NULL) {
    return STATUS_SUCCESS;
  }

  status = UdecxUsbDevicePlugOutAndDelete(usb_device);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  KeAcquireSpinLock(&context->port_state_lock, &old_irql);
  if (port_state->usb_device == usb_device) {
    port_state->usb_device = NULL;
    port_state->usb_device_plugged = FALSE;
    port_state->usb_profile = 0;
    port_state->usb_profile_valid = FALSE;
  }
  KeReleaseSpinLock(&context->port_state_lock, old_irql);

  KdPrint(("vds_usb: port %lu usb child deleted\n", port_index));
  return STATUS_SUCCESS;
}

static NTSTATUS VdsCreateUsbChildDevice(WDFDEVICE device, ULONG port_index) {
  PVDS_DEVICE_CONTEXT context;
  PVDS_PORT_STATE port_state;
  PVDS_UDECX_DEVICE_CONTEXT udecx_context;
  VDS_DESCRIPTOR_VIEW configuration_descriptor;
  VDS_DESCRIPTOR_VIEW device_descriptor;
  UDECX_USB_DEVICE_STATE_CHANGE_CALLBACKS callbacks;
  WDF_OBJECT_ATTRIBUTES attributes;
  ULONG profile;
  NTSTATUS status;

  context = VdsGetDeviceContext(device);
  if (port_index >= context->max_port) {
    return STATUS_DEVICE_NOT_READY;
  }

  port_state = &context->port_state[port_index];
  profile = port_state->profile;
  if (!VdsIsValidProfile(profile)) {
    profile = VDS_PROFILE_DSE;
  }
  if (port_state->usb_device != NULL) {
    if (port_state->usb_profile_valid && port_state->usb_profile == profile) {
      return STATUS_SUCCESS;
    }
    status = VdsDeleteUsbChildDevice(device, port_index);
    if (!NT_SUCCESS(status)) {
      return status;
    }
  }
  device_descriptor = VdsDeviceDescriptorForProfile(profile);
  configuration_descriptor = VdsConfigurationDescriptorForProfile(profile);

  port_state->usb_device_init = UdecxUsbDeviceInitAllocate(device);
  if (port_state->usb_device_init == NULL) {
    return STATUS_INSUFFICIENT_RESOURCES;
  }

  UDECX_USB_DEVICE_CALLBACKS_INIT(&callbacks);
  callbacks.EvtUsbDeviceDefaultEndpointAdd = VdsEvtDefaultEndpointAdd;
  callbacks.EvtUsbDeviceEndpointAdd = VdsEvtEndpointAdd;
  callbacks.EvtUsbDeviceEndpointsConfigure = VdsEvtEndpointsConfigure;
  callbacks.EvtUsbDeviceLinkPowerEntry = VdsEvtDeviceLinkPowerEntry;
  callbacks.EvtUsbDeviceLinkPowerExit = VdsEvtDeviceLinkPowerExit;
  UdecxUsbDeviceInitSetStateChangeCallbacks(port_state->usb_device_init,
                                            &callbacks);

  UdecxUsbDeviceInitSetSpeed(port_state->usb_device_init, UdecxUsbHighSpeed);
  UdecxUsbDeviceInitSetEndpointsType(port_state->usb_device_init,
                                     UdecxEndpointTypeDynamic);

  status = UdecxUsbDeviceInitAddDescriptor(port_state->usb_device_init,
                                           (PUCHAR)device_descriptor.data,
                                           device_descriptor.size);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x101);
  }

  status = UdecxUsbDeviceInitAddDescriptor(
      port_state->usb_device_init, (PUCHAR)configuration_descriptor.data,
      configuration_descriptor.size);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x102);
  }

  status = UdecxUsbDeviceInitAddDescriptorWithIndex(
      port_state->usb_device_init, (PUCHAR)vds_usb_language_descriptor,
      sizeof(vds_usb_language_descriptor), 0);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x103);
  }

  status = VdsAddStringDescriptor(port_state->usb_device_init,
                                  VDS_USB_MANUFACTURER_STRING, 1);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x104);
  }

  status = VdsAddStringDescriptor(port_state->usb_device_init,
                                  VdsProductStringForProfile(profile), 2);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x105);
  }

  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes,
                                          VDS_UDECX_DEVICE_CONTEXT);
  status = UdecxUsbDeviceCreate(&port_state->usb_device_init, &attributes,
                                &port_state->usb_device);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x106);
  }
  port_state->usb_device_init = NULL;

  udecx_context = VdsGetUdecxDeviceContext(port_state->usb_device);
  udecx_context->wdf_device = device;
  udecx_context->port_index = port_index;
  port_state->usb_profile = profile;
  port_state->usb_profile_valid = TRUE;

  return STATUS_SUCCESS;
}

static NTSTATUS VdsPlugUsbChildDevice(WDFDEVICE device, ULONG port_index) {
  PVDS_DEVICE_CONTEXT context;
  PVDS_PORT_STATE port_state;
  UDECX_USB_DEVICE_PLUG_IN_OPTIONS plug_in_options;
  NTSTATUS status;
  KIRQL old_irql;

  context = VdsGetDeviceContext(device);
  if (port_index >= context->max_port) {
    return STATUS_DEVICE_NOT_READY;
  }

  port_state = &context->port_state[port_index];
  status = VdsCreateUsbChildDevice(device, port_index);
  if (!NT_SUCCESS(status)) {
    return status;
  }
  if (port_state->usb_device_plugged) {
    return STATUS_SUCCESS;
  }

  UDECX_USB_DEVICE_PLUG_IN_OPTIONS_INIT(&plug_in_options);
  plug_in_options.Usb20PortNumber = port_index + 1;
  status = UdecxUsbDevicePlugIn(port_state->usb_device, &plug_in_options);
  if (NT_SUCCESS(status)) {
    KeAcquireSpinLock(&context->port_state_lock, &old_irql);
    port_state->usb_device_plugged = TRUE;
    KeReleaseSpinLock(&context->port_state_lock, old_irql);
  } else {
    return VdsStageFailure(status, 0x200);
  }

  return status;
}

static NTSTATUS VdsEvtDeviceD0Entry(WDFDEVICE device,
                                    WDF_POWER_DEVICE_STATE previous_state) {
  UNREFERENCED_PARAMETER(device);
  UNREFERENCED_PARAMETER(previous_state);

  return STATUS_SUCCESS;
}

static VOID VdsEvtDeviceContextCleanup(WDFOBJECT device_object) {
  PVDS_DEVICE_CONTEXT context = VdsGetDeviceContext(device_object);
  ULONG port_index;

  for (port_index = 0; port_index < VDS_MAX_PORT_COUNT; ++port_index) {
    if (context->control_devices[port_index] != NULL) {
      WdfObjectDelete(context->control_devices[port_index]);
      context->control_devices[port_index] = NULL;
    }
  }

  /* UdeCx owns created usb_device teardown during WDF device removal. */
  for (port_index = 0; port_index < VDS_MAX_PORT_COUNT; ++port_index) {
    if (context->port_state[port_index].usb_device_init != NULL) {
      UdecxUsbDeviceInitFree(context->port_state[port_index].usb_device_init);
      context->port_state[port_index].usb_device_init = NULL;
    }
  }
}

static VOID VdsCompleteAudioStats(WDFDEVICE device, WDFREQUEST request) {
  PVDS_DEVICE_CONTEXT context;
  PVDS_AUDIO_STATS stats;
  ULONG channel;
  NTSTATUS status;

  status = WdfRequestRetrieveOutputBuffer(request, sizeof(*stats),
                                          (PVOID *)&stats, NULL);
  if (!NT_SUCCESS(status)) {
    WdfRequestComplete(request, status);
    return;
  }

  context = VdsGetDeviceContext(device);
  stats->control_urb_count =
      (ULONG)InterlockedOr(&context->control_urb_count, 0);
  stats->last_control_bm_request =
      (ULONG)InterlockedOr(&context->last_control_bm_request, 0);
  stats->last_control_b_request =
      (ULONG)InterlockedOr(&context->last_control_b_request, 0);
  stats->last_control_w_value =
      (ULONG)InterlockedOr(&context->last_control_w_value, 0);
  stats->last_control_w_index =
      (ULONG)InterlockedOr(&context->last_control_w_index, 0);
  stats->last_control_w_length =
      (ULONG)InterlockedOr(&context->last_control_w_length, 0);
  stats->last_control_bytes_completed =
      (ULONG)InterlockedOr(&context->last_control_bytes_completed, 0);
  stats->iso_out_request_count =
      (ULONG)InterlockedOr(&context->iso_out_request_count, 0);
  stats->iso_out_byte_count =
      (ULONG)InterlockedOr(&context->iso_out_byte_count, 0);
  stats->last_pcm_frame_count =
      (LONG)InterlockedOr(&context->last_pcm_frame_count, 0);
  for (channel = 0; channel < VDS_PCM_CHANNELS; ++channel) {
    stats->last_pcm_sample[channel] =
        (LONG)InterlockedOr(&context->last_pcm_sample[channel], 0);
    stats->last_pcm_peak[channel] =
        (LONG)InterlockedOr(&context->last_pcm_peak[channel], 0);
  }
  stats->non_iso_urb_count =
      (ULONG)InterlockedOr(&context->non_iso_urb_count, 0);
  stats->last_iso_packets = (ULONG)InterlockedOr(&context->last_iso_packets, 0);
  stats->last_iso_length = (ULONG)InterlockedOr(&context->last_iso_length, 0);
  stats->last_non_iso_function =
      (ULONG)InterlockedOr(&context->last_non_iso_function, 0);
  stats->endpoint_reset_count =
      (ULONG)InterlockedOr(&context->endpoint_reset_count, 0);
  stats->endpoint_start_count =
      (ULONG)InterlockedOr(&context->endpoint_start_count, 0);
  stats->endpoint_purge_count =
      (ULONG)InterlockedOr(&context->endpoint_purge_count, 0);
  stats->configure_count = (ULONG)InterlockedOr(&context->configure_count, 0);
  stats->configure_endpoint_count =
      (ULONG)InterlockedOr(&context->configure_endpoint_count, 0);
  stats->configure_release_count =
      (ULONG)InterlockedOr(&context->configure_release_count, 0);
  stats->last_configure_type =
      (ULONG)InterlockedOr(&context->last_configure_type, 0);
  stats->last_interface = (ULONG)InterlockedOr(&context->last_interface, 0);
  stats->last_alt_setting = (ULONG)InterlockedOr(&context->last_alt_setting, 0);
  stats->configure_history_sequence =
      (ULONG)InterlockedOr(&context->configure_history_sequence, 0);
  RtlCopyMemory(stats->configure_history, context->configure_history,
                sizeof(stats->configure_history));
  stats->async_urb_complete_count =
      (ULONG)InterlockedOr(&context->async_urb_complete_count, 0);
  stats->async_urb_forward_failure_count =
      (ULONG)InterlockedOr(&context->async_urb_forward_failure_count, 0);
  stats->delayed_iso_urb_count =
      (ULONG)InterlockedOr(&context->delayed_iso_urb_count, 0);
  stats->delayed_iso_urb_complete_count =
      (ULONG)InterlockedOr(&context->delayed_iso_urb_complete_count, 0);
  stats->delayed_iso_urb_timer_failure_count =
      (ULONG)InterlockedOr(&context->delayed_iso_urb_timer_failure_count, 0);
  stats->endpoint_queue_refresh_count =
      (ULONG)InterlockedOr(&context->endpoint_queue_refresh_count, 0);
  stats->endpoint_queue_refresh_failure_count =
      (ULONG)InterlockedOr(&context->endpoint_queue_refresh_failure_count, 0);
  stats->endpoint_release_delay_count =
      (ULONG)InterlockedOr(&context->endpoint_release_delay_count, 0);
  stats->endpoint_release_delay_complete_count =
      (ULONG)InterlockedOr(&context->endpoint_release_delay_complete_count, 0);
  stats->endpoint_release_delay_timer_failure_count = (ULONG)InterlockedOr(
      &context->endpoint_release_delay_timer_failure_count, 0);
  WdfRequestCompleteWithInformation(request, STATUS_SUCCESS, sizeof(*stats));
}

static VOID VdsCompletePortInfo(PVDS_CONTROL_DEVICE_CONTEXT control_context,
                                WDFREQUEST request) {
  PVDS_DEVICE_CONTEXT device_context;
  struct vds_port_info *info;
  KIRQL old_irql;
  ULONG profile;
  ULONG usb_profile;
  BOOLEAN bound;
  BOOLEAN usb_device_plugged;
  BOOLEAN usb_profile_valid;
  NTSTATUS status;

  status = WdfRequestRetrieveOutputBuffer(request, sizeof(*info),
                                          (PVOID *)&info, NULL);
  if (!NT_SUCCESS(status)) {
    WdfRequestComplete(request, status);
    return;
  }

  device_context = VdsGetDeviceContext(control_context->parent_device);
  KeAcquireSpinLock(&device_context->port_state_lock, &old_irql);
  profile = device_context->port_state[control_context->port_index].profile;
  usb_profile =
      device_context->port_state[control_context->port_index].usb_profile;
  bound = device_context->port_state[control_context->port_index].bound;
  usb_device_plugged = device_context->port_state[control_context->port_index]
                           .usb_device_plugged;
  usb_profile_valid =
      device_context->port_state[control_context->port_index].usb_profile_valid;
  KeReleaseSpinLock(&device_context->port_state_lock, old_irql);

  RtlZeroMemory(info, sizeof(*info));
  info->version = VDS_PORT_INFO_VERSION;
  info->size = sizeof(*info);
  info->port_index = control_context->port_index;
  info->max_port = device_context->max_port;
  info->profile = profile;
  info->usb_profile = usb_profile;
  if (control_context->port_index < device_context->max_port) {
    info->flags |= VDS_PORT_INFO_ENABLED;
  }
  if (bound) {
    info->flags |= VDS_PORT_INFO_BOUND | VDS_PORT_INFO_PROFILE_VALID;
  }
  if (bound) {
    info->flags |= VDS_PORT_INFO_ACTIVE;
  }
  if (usb_device_plugged) {
    info->flags |= VDS_PORT_INFO_USB_PLUGGED;
  }
  if (usb_profile_valid) {
    info->flags |= VDS_PORT_INFO_USB_PROFILE_VALID;
  }

  WdfRequestCompleteWithInformation(request, STATUS_SUCCESS, sizeof(*info));
}

static VOID VdsBindPort(PVDS_CONTROL_DEVICE_CONTEXT control_context,
                        WDFREQUEST request) {
  PVDS_DEVICE_CONTEXT device_context;
  struct vds_port_bind *bind;
  PVDS_PORT_STATE port_state;
  WDFFILEOBJECT file_object;
  KIRQL old_irql;
  NTSTATUS status;

  device_context = VdsGetDeviceContext(control_context->parent_device);
  if (control_context->port_index >= device_context->max_port) {
    WdfRequestComplete(request, STATUS_DEVICE_NOT_READY);
    return;
  }

  status = WdfRequestRetrieveInputBuffer(request, sizeof(*bind), (PVOID *)&bind,
                                         NULL);
  if (!NT_SUCCESS(status)) {
    WdfRequestComplete(request, status);
    return;
  }
  if (bind->version != VDS_PORT_BIND_VERSION || bind->size != sizeof(*bind) ||
      !VdsIsValidProfile(bind->profile)) {
    WdfRequestComplete(request, STATUS_INVALID_PARAMETER);
    return;
  }

  file_object = WdfRequestGetFileObject(request);
  if (file_object == NULL) {
    WdfRequestComplete(request, STATUS_INVALID_DEVICE_STATE);
    return;
  }

  port_state = &device_context->port_state[control_context->port_index];
  KeAcquireSpinLock(&device_context->port_state_lock, &old_irql);
  if (port_state->bound && port_state->bound_file != file_object) {
    KeReleaseSpinLock(&device_context->port_state_lock, old_irql);
    WdfRequestComplete(request, STATUS_DEVICE_BUSY);
    return;
  }
  port_state->profile = bind->profile;
  port_state->bound = TRUE;
  port_state->bound_file = file_object;
  KeReleaseSpinLock(&device_context->port_state_lock, old_irql);

  status = VdsPlugUsbChildDevice(control_context->parent_device,
                                 control_context->port_index);
  if (!NT_SUCCESS(status)) {
    KeAcquireSpinLock(&device_context->port_state_lock, &old_irql);
    if (port_state->bound_file == file_object) {
      port_state->bound = FALSE;
      port_state->bound_file = NULL;
    }
    KeReleaseSpinLock(&device_context->port_state_lock, old_irql);
    WdfRequestComplete(request, status);
    return;
  }
  KdPrint(("vds_usb: port %lu bound profile=%lu\n", control_context->port_index,
           bind->profile));
  WdfRequestComplete(request, STATUS_SUCCESS);
}

static VOID VdsUnbindPort(PVDS_CONTROL_DEVICE_CONTEXT control_context,
                          WDFREQUEST request) {
  PVDS_DEVICE_CONTEXT device_context;
  PVDS_PORT_STATE port_state;
  WDFFILEOBJECT file_object;
  KIRQL old_irql;
  NTSTATUS status;

  device_context = VdsGetDeviceContext(control_context->parent_device);
  if (control_context->port_index >= device_context->max_port) {
    WdfRequestComplete(request, STATUS_DEVICE_NOT_READY);
    return;
  }

  file_object = WdfRequestGetFileObject(request);
  if (file_object == NULL) {
    WdfRequestComplete(request, STATUS_INVALID_DEVICE_STATE);
    return;
  }

  status = STATUS_SUCCESS;
  port_state = &device_context->port_state[control_context->port_index];
  KeAcquireSpinLock(&device_context->port_state_lock, &old_irql);
  if (port_state->bound && port_state->bound_file != file_object) {
    status = STATUS_ACCESS_DENIED;
  } else {
    port_state->bound = FALSE;
    port_state->bound_file = NULL;
  }
  KeReleaseSpinLock(&device_context->port_state_lock, old_irql);

  if (NT_SUCCESS(status)) {
    status = VdsDeleteUsbChildDevice(control_context->parent_device,
                                     control_context->port_index);
  }

  if (NT_SUCCESS(status)) {
    KdPrint(("vds_usb: port %lu unbound\n", control_context->port_index));
  }
  WdfRequestComplete(request, status);
}

static VOID VdsEvtIoDeviceControl(WDFQUEUE queue, WDFREQUEST request,
                                  size_t output_buffer_length,
                                  size_t input_buffer_length,
                                  ULONG io_control_code) {
  BOOLEAN handled;

  UNREFERENCED_PARAMETER(output_buffer_length);
  UNREFERENCED_PARAMETER(input_buffer_length);

  if (io_control_code == VDS_IOCTL_GET_AUDIO_STATS) {
    VdsCompleteAudioStats(WdfIoQueueGetDevice(queue), request);
    return;
  }

  handled =
      UdecxWdfDeviceTryHandleUserIoctl(WdfIoQueueGetDevice(queue), request);
  if (!handled) {
    WdfRequestComplete(request, STATUS_INVALID_DEVICE_REQUEST);
  }
}

static VOID VdsEvtControlRead(WDFQUEUE queue, WDFREQUEST request,
                              size_t length) {
  PVDS_CONTROL_DEVICE_CONTEXT control_context;
  PVDS_DEVICE_CONTEXT device_context;
  PVDS_PORT_STATE port_state;
  NTSTATUS status;

  if (length == 0) {
    WdfRequestComplete(request, STATUS_INVALID_BUFFER_SIZE);
    return;
  }

  control_context = VdsGetControlDeviceContext(WdfIoQueueGetDevice(queue));
  device_context = VdsGetDeviceContext(control_context->parent_device);
  if (!VdsPortReadyForIo(device_context, control_context->port_index)) {
    WdfRequestComplete(request, STATUS_DEVICE_NOT_READY);
    return;
  }

  port_state = &device_context->port_state[control_context->port_index];
  status = WdfRequestForwardToIoQueue(request, port_state->control_read_queue);
  if (!NT_SUCCESS(status)) {
    WdfRequestComplete(request, status);
    return;
  }

  VdsCompleteControlReadRequests(port_state);
}

static VOID VdsEvtControlWrite(WDFQUEUE queue, WDFREQUEST request,
                               size_t length) {
  PVDS_CONTROL_DEVICE_CONTEXT control_context;
  PVDS_DEVICE_CONTEXT device_context;
  PUCHAR buffer;
  size_t buffer_length;
  ULONG offset;
  NTSTATUS status;

  if (length < sizeof(struct vds_frame_header)) {
    WdfRequestComplete(request, STATUS_INVALID_BUFFER_SIZE);
    return;
  }

  status =
      WdfRequestRetrieveInputBuffer(request, sizeof(struct vds_frame_header),
                                    (PVOID *)&buffer, &buffer_length);
  if (!NT_SUCCESS(status)) {
    WdfRequestComplete(request, status);
    return;
  }

  control_context = VdsGetControlDeviceContext(WdfIoQueueGetDevice(queue));
  device_context = VdsGetDeviceContext(control_context->parent_device);
  if (!VdsPortReadyForIo(device_context, control_context->port_index)) {
    WdfRequestComplete(request, STATUS_DEVICE_NOT_READY);
    return;
  }

  offset = 0;
  while (offset + sizeof(struct vds_frame_header) <= buffer_length) {
    struct vds_frame_header header;
    UCHAR *payload;
    ULONG frame_size;

    RtlCopyMemory(&header, buffer + offset, sizeof(header));
    if (header.length > VDS_FRAME_MAX_PAYLOAD) {
      status = STATUS_INVALID_BUFFER_SIZE;
      break;
    }

    frame_size = sizeof(header) + header.length;
    if (offset + frame_size > buffer_length) {
      status = STATUS_INVALID_BUFFER_SIZE;
      break;
    }

    payload = buffer + offset + sizeof(header);
    if (header.type == VDS_FRAME_USB_HID_IN) {
      VdsStoreInputReport(
          &device_context->port_state[control_context->port_index], payload,
          header.length);
    } else if (header.type == VDS_FRAME_USB_FEATURE_REPLY) {
      VdsUpdateFeatureCache(
          &device_context->port_state[control_context->port_index], payload,
          header.length);
    }

    offset += frame_size;
  }

  if (NT_SUCCESS(status)) {
    WdfRequestCompleteWithInformation(request, STATUS_SUCCESS, buffer_length);
  } else {
    WdfRequestComplete(request, status);
  }
}

static VOID VdsEvtControlDeviceControl(WDFQUEUE queue, WDFREQUEST request,
                                       size_t output_buffer_length,
                                       size_t input_buffer_length,
                                       ULONG io_control_code) {
  UNREFERENCED_PARAMETER(output_buffer_length);
  UNREFERENCED_PARAMETER(input_buffer_length);

  if (io_control_code == VDS_IOCTL_GET_AUDIO_STATS) {
    PVDS_CONTROL_DEVICE_CONTEXT control_context;

    control_context = VdsGetControlDeviceContext(WdfIoQueueGetDevice(queue));
    if (control_context->port_index != 0) {
      WdfRequestComplete(request, STATUS_DEVICE_NOT_READY);
      return;
    }

    VdsCompleteAudioStats(control_context->parent_device, request);
    return;
  }

  if (io_control_code == VDS_IOCTL_GET_PORT_INFO) {
    PVDS_CONTROL_DEVICE_CONTEXT control_context;

    control_context = VdsGetControlDeviceContext(WdfIoQueueGetDevice(queue));
    VdsCompletePortInfo(control_context, request);
    return;
  }

  if (io_control_code == VDS_IOCTL_BIND_PORT) {
    PVDS_CONTROL_DEVICE_CONTEXT control_context;

    control_context = VdsGetControlDeviceContext(WdfIoQueueGetDevice(queue));
    VdsBindPort(control_context, request);
    return;
  }

  if (io_control_code == VDS_IOCTL_UNBIND_PORT) {
    PVDS_CONTROL_DEVICE_CONTEXT control_context;

    control_context = VdsGetControlDeviceContext(WdfIoQueueGetDevice(queue));
    VdsUnbindPort(control_context, request);
    return;
  }

  WdfRequestComplete(request, STATUS_INVALID_DEVICE_REQUEST);
}

static VOID VdsEvtControlFileCleanup(WDFFILEOBJECT file_object) {
  WDFDEVICE control_device;
  PVDS_CONTROL_DEVICE_CONTEXT control_context;
  PVDS_DEVICE_CONTEXT device_context;
  PVDS_PORT_STATE port_state;
  KIRQL old_irql;
  BOOLEAN unbound;

  control_device = WdfFileObjectGetDevice(file_object);
  control_context = VdsGetControlDeviceContext(control_device);
  device_context = VdsGetDeviceContext(control_context->parent_device);
  if (control_context->port_index >= device_context->max_port) {
    return;
  }

  unbound = FALSE;
  port_state = &device_context->port_state[control_context->port_index];
  KeAcquireSpinLock(&device_context->port_state_lock, &old_irql);
  if (port_state->bound && port_state->bound_file == file_object) {
    port_state->bound = FALSE;
    port_state->bound_file = NULL;
    unbound = TRUE;
  }
  KeReleaseSpinLock(&device_context->port_state_lock, old_irql);

  if (unbound) {
    KdPrint(("vds_usb: port %lu unbound by file cleanup\n",
             control_context->port_index));
  }
}

static NTSTATUS VdsCreateControlDevice(WDFDRIVER driver, WDFDEVICE device,
                                       ULONG port_index) {
  DECLARE_CONST_UNICODE_STRING(sddl,
                               L"D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;BU)");
  WCHAR device_name_buffer[] = L"\\Device\\vds0";
  WCHAR symbolic_link_buffer[] = L"\\DosDevices\\vds0";
  UNICODE_STRING device_name;
  UNICODE_STRING symbolic_link;
  PVDS_CONTROL_DEVICE_CONTEXT control_context;
  PVDS_DEVICE_CONTEXT device_context;
  PWDFDEVICE_INIT control_init;
  WDFDEVICE control_device;
  WDF_FILEOBJECT_CONFIG file_config;
  WDF_IO_QUEUE_CONFIG queue_config;
  WDF_OBJECT_ATTRIBUTES attributes;
  NTSTATUS status;

  device_context = VdsGetDeviceContext(device);
  device_name_buffer[RTL_NUMBER_OF(device_name_buffer) - 2] =
      (WCHAR)(L'0' + port_index);
  symbolic_link_buffer[RTL_NUMBER_OF(symbolic_link_buffer) - 2] =
      (WCHAR)(L'0' + port_index);
  RtlInitUnicodeString(&device_name, device_name_buffer);
  RtlInitUnicodeString(&symbolic_link, symbolic_link_buffer);

  KdPrint(("vds_usb: creating control path vds%lu max_port=%lu\n", port_index,
           device_context->max_port));

  control_init = WdfControlDeviceInitAllocate(driver, &sddl);
  if (control_init == NULL) {
    return STATUS_INSUFFICIENT_RESOURCES;
  }

  status = WdfDeviceInitAssignName(control_init, &device_name);
  if (!NT_SUCCESS(status)) {
    WdfDeviceInitFree(control_init);
    return status;
  }

  WDF_FILEOBJECT_CONFIG_INIT(&file_config, WDF_NO_EVENT_CALLBACK,
                             WDF_NO_EVENT_CALLBACK, VdsEvtControlFileCleanup);
  file_config.FileObjectClass = WdfFileObjectWdfCannotUseFsContexts;
  WdfDeviceInitSetFileObjectConfig(control_init, &file_config,
                                   WDF_NO_OBJECT_ATTRIBUTES);

  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes,
                                          VDS_CONTROL_DEVICE_CONTEXT);
  status = WdfDeviceCreate(&control_init, &attributes, &control_device);
  if (!NT_SUCCESS(status)) {
    if (control_init != NULL) {
      WdfDeviceInitFree(control_init);
    }
    return status;
  }

  control_context = VdsGetControlDeviceContext(control_device);
  control_context->parent_device = device;
  control_context->port_index = port_index;

  WDF_IO_QUEUE_CONFIG_INIT(&queue_config, WdfIoQueueDispatchManual);
  queue_config.PowerManaged = WdfFalse;
  status = WdfIoQueueCreate(
      control_device, &queue_config, WDF_NO_OBJECT_ATTRIBUTES,
      &device_context->port_state[port_index].control_read_queue);
  if (!NT_SUCCESS(status)) {
    WdfObjectDelete(control_device);
    return status;
  }

  status = WdfDeviceCreateSymbolicLink(control_device, &symbolic_link);
  if (!NT_SUCCESS(status)) {
    WdfObjectDelete(control_device);
    return status;
  }

  WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(&queue_config,
                                         WdfIoQueueDispatchSequential);
  queue_config.EvtIoRead = VdsEvtControlRead;
  queue_config.EvtIoWrite = VdsEvtControlWrite;
  queue_config.EvtIoDeviceControl = VdsEvtControlDeviceControl;
  queue_config.PowerManaged = WdfFalse;
  status = WdfIoQueueCreate(control_device, &queue_config,
                            WDF_NO_OBJECT_ATTRIBUTES, WDF_NO_HANDLE);
  if (!NT_SUCCESS(status)) {
    WdfObjectDelete(control_device);
    return status;
  }

  WdfControlFinishInitializing(control_device);
  device_context->control_devices[port_index] = control_device;
  return STATUS_SUCCESS;
}

static NTSTATUS VdsCreateControlDevices(WDFDRIVER driver, WDFDEVICE device) {
  PVDS_DEVICE_CONTEXT device_context;
  ULONG port_index;
  NTSTATUS status;

  device_context = VdsGetDeviceContext(device);

  for (port_index = 0; port_index < VDS_MAX_PORT_COUNT; ++port_index) {
    status = VdsCreateControlDevice(driver, device, port_index);
    if (!NT_SUCCESS(status)) {
      return status;
    }
  }

  return STATUS_SUCCESS;
}

static NTSTATUS VdsEvtDeviceAdd(WDFDRIVER driver, PWDFDEVICE_INIT device_init) {
  WDF_OBJECT_ATTRIBUTES attributes;
  WDF_FILEOBJECT_CONFIG file_config;
  WDF_IO_QUEUE_CONFIG queue_config;
  WDF_PNPPOWER_EVENT_CALLBACKS pnp_callbacks;
  UDECX_WDF_DEVICE_CONFIG udecx_config;
  WDFDEVICE device;
  UNICODE_STRING ref_string;
  PVDS_DEVICE_CONTEXT context;
  NTSTATUS status;
  ULONG port_index;

  WDF_PNPPOWER_EVENT_CALLBACKS_INIT(&pnp_callbacks);
  pnp_callbacks.EvtDeviceD0Entry = VdsEvtDeviceD0Entry;
  WdfDeviceInitSetPnpPowerEventCallbacks(device_init, &pnp_callbacks);

  WDF_FILEOBJECT_CONFIG_INIT(&file_config, WDF_NO_EVENT_CALLBACK,
                             WDF_NO_EVENT_CALLBACK, WDF_NO_EVENT_CALLBACK);
  file_config.FileObjectClass = WdfFileObjectWdfCannotUseFsContexts;
  WdfDeviceInitSetFileObjectConfig(device_init, &file_config,
                                   WDF_NO_OBJECT_ATTRIBUTES);

  status = UdecxInitializeWdfDeviceInit(device_init);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x002);
  }

  WDF_OBJECT_ATTRIBUTES_INIT_CONTEXT_TYPE(&attributes, VDS_DEVICE_CONTEXT);
  attributes.EvtCleanupCallback = VdsEvtDeviceContextCleanup;

  status = WdfDeviceCreate(&device_init, &attributes, &device);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x004);
  }

  context = VdsGetDeviceContext(device);
  context->max_port = VdsReadMaxPort(driver);
  KeInitializeSpinLock(&context->port_state_lock);
  for (port_index = 0; port_index < VDS_MAX_PORT_COUNT; ++port_index) {
    VdsInitializePortState(&context->port_state[port_index]);
  }

  status = VdsAddUsbBusInterface(device);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x005);
  }

  RtlInitUnicodeString(&ref_string, L"GUID_DEVINTERFACE_USB_HOST_CONTROLLER");
  status = WdfDeviceCreateDeviceInterface(
      device, (LPGUID)&GUID_DEVINTERFACE_USB_HOST_CONTROLLER, &ref_string);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x006);
  }

  UDECX_WDF_DEVICE_CONFIG_INIT(&udecx_config, VdsEvtQueryUsbCapability);
  udecx_config.NumberOfUsb20Ports = (USHORT)context->max_port;
  status = UdecxWdfDeviceAddUsbDeviceEmulation(device, &udecx_config);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x007);
  }

  WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(&queue_config,
                                         WdfIoQueueDispatchSequential);
  queue_config.EvtIoDeviceControl = VdsEvtIoDeviceControl;
  queue_config.PowerManaged = WdfFalse;

  status = WdfIoQueueCreate(device, &queue_config, WDF_NO_OBJECT_ATTRIBUTES,
                            WDF_NO_HANDLE);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x008);
  }

  status = VdsCreateControlDevices(driver, device);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x009);
  }

  status = VdsCreateUrbCompletionObjects(device);
  if (!NT_SUCCESS(status)) {
    return VdsStageFailure(status, 0x00a);
  }

  KdPrint(("vds_usb: root initialized max_port=%lu\n", context->max_port));
  return STATUS_SUCCESS;
}

NTSTATUS DriverEntry(PDRIVER_OBJECT driver_object,
                     PUNICODE_STRING registry_path) {
  WDF_DRIVER_CONFIG config;

  WDF_DRIVER_CONFIG_INIT(&config, VdsEvtDeviceAdd);
  return WdfDriverCreate(driver_object, registry_path, WDF_NO_OBJECT_ATTRIBUTES,
                         &config, WDF_NO_HANDLE);
}

// SPDX-License-Identifier: MIT
// Copyright (C) 2026 Jihong Min <hurryman2212@gmail.com>

#include <ntifs.h>
#include <ntstrsafe.h>

#include "uapi/vds.h"

NTKERNELAPI UCHAR *PsGetProcessImageFileName(PEPROCESS process);

#define VDS_FILTER_DEVICE_NAME L"\\Device\\VdsFilter"
#define VDS_FILTER_SYMBOLIC_NAME L"\\DosDevices\\vds_filter"
#define VDS_FILTER_POOL_TAG 'dfSV'
#define VDS_HID_OUT_CTL_CODE(id)                                               \
  CTL_CODE(FILE_DEVICE_KEYBOARD, (id), METHOD_OUT_DIRECT, FILE_ANY_ACCESS)
#define VDS_IOCTL_HID_GET_MANUFACTURER_STRING VDS_HID_OUT_CTL_CODE(110)
#define VDS_IOCTL_HID_GET_PRODUCT_STRING VDS_HID_OUT_CTL_CODE(111)
#define VDS_IOCTL_HID_GET_SERIALNUMBER_STRING VDS_HID_OUT_CTL_CODE(112)

static const DEVPROPKEY vds_devpkey_device_instance_id = {
    {0x78c34fc8,
     0x104a,
     0x4aca,
     {0x9e, 0xa4, 0x52, 0x4d, 0x52, 0x99, 0x6e, 0x57}},
    256};

static const DEVPROPKEY vds_devpkey_device_parent = {
    {0x4340a6c5,
     0x93fa,
     0x4706,
     {0x97, 0x2c, 0x7b, 0x64, 0x80, 0x08, 0xa5, 0xa7}},
    8};

struct _VDS_FILTER_EXTENSION;

typedef struct _VDS_FILTER_EXTENSION {
  BOOLEAN is_control;
  BOOLEAN listed;
  BOOLEAN report_target;
  BOOLEAN provide_hid_strings;
  BOOLEAN symbolic_link_created;
  PDEVICE_OBJECT filter_device;
  PDEVICE_OBJECT physical_device;
  PDEVICE_OBJECT lower_device;
  LIST_ENTRY list_entry;
  ULONG profile;
  PCWSTR product_string;
  CHAR address[18];
  WCHAR device_name_buffer[64];
  WCHAR symbolic_name_buffer[64];
} VDS_FILTER_EXTENSION, *PVDS_FILTER_EXTENSION;

static FAST_MUTEX vds_device_list_lock;
static LIST_ENTRY vds_device_list;
static PDEVICE_OBJECT vds_control_device;
static volatile LONG vds_next_filter_instance;

static BOOLEAN VdsAsciiEqualInsensitive(const CHAR *left, const CHAR *right) {
  CHAR left_char;
  CHAR right_char;

  if (left == NULL || right == NULL) {
    return FALSE;
  }

  for (;;) {
    left_char = *left++;
    right_char = *right++;
    if (left_char >= 'A' && left_char <= 'Z') {
      left_char = (CHAR)(left_char - 'A' + 'a');
    }
    if (right_char >= 'A' && right_char <= 'Z') {
      right_char = (CHAR)(right_char - 'A' + 'a');
    }

    if (left_char != right_char) {
      return FALSE;
    }
    if (left_char == '\0') {
      return TRUE;
    }
  }
}

static BOOLEAN VdsAddressEqual(const CHAR left[18], const CHAR right[18]) {
  ULONG index;

  for (index = 0; index < 18; ++index) {
    CHAR left_char = left[index];
    CHAR right_char = right[index];
    if (left_char >= 'A' && left_char <= 'Z') {
      left_char = (CHAR)(left_char - 'A' + 'a');
    }
    if (right_char >= 'A' && right_char <= 'Z') {
      right_char = (CHAR)(right_char - 'A' + 'a');
    }
    if (left_char != right_char) {
      return FALSE;
    }
    if (left_char == '\0') {
      return TRUE;
    }
  }
  return TRUE;
}

static BOOLEAN VdsCallerIsAllowed(PIRP irp) {
  BOOLEAN allowed;
  BOOLEAN referenced;
  HANDLE process_id;
  PEPROCESS process;
  const CHAR *image_name;

  if (irp->RequestorMode == KernelMode) {
    return TRUE;
  }

  process = NULL;
  referenced = FALSE;
  process_id = (HANDLE)(ULONG_PTR)IoGetRequestorProcessId(irp);
  if (process_id != NULL &&
      NT_SUCCESS(PsLookupProcessByProcessId(process_id, &process))) {
    referenced = TRUE;
  } else {
    process = PsGetCurrentProcess();
  }
  image_name = (const CHAR *)PsGetProcessImageFileName(process);
  allowed = VdsAsciiEqualInsensitive(image_name, "vdsd.exe") ||
            VdsAsciiEqualInsensitive(image_name, "vdsctl.exe");
  if (referenced) {
    ObDereferenceObject(process);
  }
  return allowed;
}

static int VdsWideHexValue(WCHAR value) {
  if (value >= L'0' && value <= L'9') {
    return value - L'0';
  }
  if (value >= L'a' && value <= L'f') {
    return value - L'a' + 10;
  }
  if (value >= L'A' && value <= L'F') {
    return value - L'A' + 10;
  }
  return -1;
}

static CHAR VdsLowerHexChar(WCHAR value) {
  if (value >= L'0' && value <= L'9') {
    return (CHAR)value;
  }
  if (value >= L'a' && value <= L'f') {
    return (CHAR)value;
  }
  return (CHAR)(value - L'A' + 'a');
}

static BOOLEAN VdsWideContainsInsensitive(PCWSTR text, PCWSTR needle) {
  SIZE_T index;
  SIZE_T needle_index;

  if (text == NULL || needle == NULL || needle[0] == L'\0') {
    return FALSE;
  }

  for (index = 0; text[index] != L'\0'; ++index) {
    for (needle_index = 0; needle[needle_index] != L'\0'; ++needle_index) {
      WCHAR left = text[index + needle_index];
      WCHAR right = needle[needle_index];
      if (left >= L'A' && left <= L'Z') {
        left = (WCHAR)(left - L'A' + L'a');
      }
      if (right >= L'A' && right <= L'Z') {
        right = (WCHAR)(right - L'A' + L'a');
      }
      if (left != right) {
        break;
      }
    }
    if (needle[needle_index] == L'\0') {
      return TRUE;
    }
  }

  return FALSE;
}

static BOOLEAN VdsWideStartsWithInsensitive(PCWSTR text, PCWSTR prefix) {
  SIZE_T index;

  if (text == NULL || prefix == NULL) {
    return FALSE;
  }

  for (index = 0; prefix[index] != L'\0'; ++index) {
    WCHAR left = text[index];
    WCHAR right = prefix[index];
    if (left >= L'A' && left <= L'Z') {
      left = (WCHAR)(left - L'A' + L'a');
    }
    if (right >= L'A' && right <= L'Z') {
      right = (WCHAR)(right - L'A' + L'a');
    }
    if (left != right) {
      return FALSE;
    }
  }

  return TRUE;
}

static BOOLEAN VdsParseBluetoothAddress(PCWSTR instance_id, CHAR address[18]) {
  WCHAR run[12];
  ULONG run_length;
  ULONG index;
  BOOLEAN inside_guid;
  BOOLEAN found;

  run_length = 0;
  inside_guid = FALSE;
  found = FALSE;
  RtlZeroMemory(address, 18);

  for (index = 0;; ++index) {
    const WCHAR value = instance_id[index];
    if (value == L'{') {
      inside_guid = TRUE;
      run_length = 0;
    } else if (value == L'}') {
      inside_guid = FALSE;
      run_length = 0;
    } else if (!inside_guid && VdsWideHexValue(value) >= 0) {
      if (run_length < RTL_NUMBER_OF(run)) {
        run[run_length] = value;
      }
      ++run_length;
    } else {
      if (run_length == RTL_NUMBER_OF(run)) {
        ULONG byte_index;

        for (byte_index = 0; byte_index < 6; ++byte_index) {
          address[byte_index * 3] = VdsLowerHexChar(run[byte_index * 2]);
          address[byte_index * 3 + 1] =
              VdsLowerHexChar(run[byte_index * 2 + 1]);
          if (byte_index != 5) {
            address[byte_index * 3 + 2] = ':';
          }
        }
        address[17] = '\0';
        found = TRUE;
      }
      run_length = 0;
      if (value == L'\0') {
        break;
      }
    }
  }

  return found;
}

static PWSTR VdsReadDeviceStringProperty(PDEVICE_OBJECT physical_device_object,
                                         const DEVPROPKEY *property_key) {
  DEVPROPTYPE property_type;
  ULONG required;
  PWSTR value;
  NTSTATUS status;

  property_type = 0;
  required = 0;
  status = IoGetDevicePropertyData(physical_device_object, property_key, 0, 0,
                                   0, NULL, &required, &property_type);
  if (status != STATUS_BUFFER_TOO_SMALL || required == 0) {
    return NULL;
  }

  value =
      (PWSTR)ExAllocatePool2(POOL_FLAG_PAGED, required, VDS_FILTER_POOL_TAG);
  if (value == NULL) {
    return NULL;
  }

  status = IoGetDevicePropertyData(physical_device_object, property_key, 0, 0,
                                   required, value, &required, &property_type);
  if (!NT_SUCCESS(status)) {
    ExFreePoolWithTag(value, VDS_FILTER_POOL_TAG);
    return NULL;
  }

  return value;
}

static VOID VdsReadPhysicalDeviceProfile(PDEVICE_OBJECT physical_device_object,
                                         PVDS_FILTER_EXTENSION extension) {
  PWSTR instance_id;
  PWSTR parent_id;
  BOOLEAN bluetooth_hid_collection;

  extension->profile = VDS_PROFILE_DS5;
  extension->report_target = FALSE;
  extension->provide_hid_strings = FALSE;
  extension->product_string = NULL;
  RtlZeroMemory(extension->address, sizeof(extension->address));

  instance_id = VdsReadDeviceStringProperty(physical_device_object,
                                            &vds_devpkey_device_instance_id);
  if (instance_id == NULL) {
    return;
  }

  if (VdsWideStartsWithInsensitive(instance_id,
                                   L"hid\\vid_054c&pid_0df2&mi_03")) {
    extension->profile = VDS_PROFILE_DSE;
    extension->provide_hid_strings = TRUE;
    extension->product_string = L"DualSense Edge Wireless Controller";
    ExFreePoolWithTag(instance_id, VDS_FILTER_POOL_TAG);
    return;
  }
  if (VdsWideStartsWithInsensitive(instance_id,
                                   L"hid\\vid_054c&pid_0ce6&mi_03")) {
    extension->profile = VDS_PROFILE_DS5;
    extension->provide_hid_strings = TRUE;
    extension->product_string = L"DualSense Wireless Controller";
    ExFreePoolWithTag(instance_id, VDS_FILTER_POOL_TAG);
    return;
  }

  bluetooth_hid_collection =
      VdsWideStartsWithInsensitive(
          instance_id,
          L"hid\\{00001124-0000-1000-8000-00805f9b34fb}_vid&0002054c_"
          L"pid&") &&
      (!VdsWideContainsInsensitive(instance_id, L"&col") ||
       VdsWideContainsInsensitive(instance_id, L"&col01"));
  extension->report_target = bluetooth_hid_collection;
  if (VdsWideContainsInsensitive(instance_id, L"pid&0df2")) {
    extension->profile = VDS_PROFILE_DSE;
  }
  (void)VdsParseBluetoothAddress(instance_id, extension->address);

  ExFreePoolWithTag(instance_id, VDS_FILTER_POOL_TAG);

  if (extension->address[0] != '\0') {
    return;
  }

  parent_id = VdsReadDeviceStringProperty(physical_device_object,
                                          &vds_devpkey_device_parent);
  if (parent_id == NULL) {
    return;
  }

  (void)VdsParseBluetoothAddress(parent_id, extension->address);
  ExFreePoolWithTag(parent_id, VDS_FILTER_POOL_TAG);
}

static VOID VdsUpdateDeviceListMembership(PVDS_FILTER_EXTENSION extension) {
  const BOOLEAN should_list =
      extension->report_target || extension->address[0] != '\0';

  ExAcquireFastMutex(&vds_device_list_lock);
  if (should_list && !extension->listed) {
    InsertTailList(&vds_device_list, &extension->list_entry);
    extension->listed = TRUE;
  } else if (!should_list && extension->listed) {
    RemoveEntryList(&extension->list_entry);
    InitializeListHead(&extension->list_entry);
    extension->listed = FALSE;
  }
  ExReleaseFastMutex(&vds_device_list_lock);
}

static VOID VdsDeleteSymbolicLink(PVDS_FILTER_EXTENSION extension) {
  UNICODE_STRING symbolic_name;

  if (!extension->symbolic_link_created) {
    return;
  }

  RtlInitUnicodeString(&symbolic_name, extension->symbolic_name_buffer);
  (void)IoDeleteSymbolicLink(&symbolic_name);
  extension->symbolic_link_created = FALSE;
  RtlZeroMemory(extension->symbolic_name_buffer,
                sizeof(extension->symbolic_name_buffer));
}

static VOID VdsUpdateSymbolicLink(PVDS_FILTER_EXTENSION extension) {
  WCHAR compact_address[13];
  UNICODE_STRING symbolic_name;
  UNICODE_STRING device_name;
  ULONG source_index;
  ULONG target_index;
  NTSTATUS status;

  if (extension->symbolic_link_created || !extension->report_target ||
      extension->address[0] == '\0') {
    return;
  }

  target_index = 0;
  for (source_index = 0; source_index < 17 && target_index < 12;
       ++source_index) {
    const CHAR value = extension->address[source_index];
    if (value == ':' || value == '\0') {
      continue;
    }
    compact_address[target_index++] = (WCHAR)value;
  }
  if (target_index != 12) {
    return;
  }
  compact_address[target_index] = L'\0';

  status =
      RtlStringCchPrintfW(extension->symbolic_name_buffer,
                          RTL_NUMBER_OF(extension->symbolic_name_buffer),
                          L"\\DosDevices\\vds_filter_%ws", compact_address);
  if (!NT_SUCCESS(status)) {
    RtlZeroMemory(extension->symbolic_name_buffer,
                  sizeof(extension->symbolic_name_buffer));
    return;
  }

  RtlInitUnicodeString(&symbolic_name, extension->symbolic_name_buffer);
  RtlInitUnicodeString(&device_name, extension->device_name_buffer);
  (void)IoDeleteSymbolicLink(&symbolic_name);
  status = IoCreateSymbolicLink(&symbolic_name, &device_name);
  if (NT_SUCCESS(status)) {
    extension->symbolic_link_created = TRUE;
    KdPrint(("vds_filter: created physical path for address=%s\n",
             extension->address));
  } else {
    RtlZeroMemory(extension->symbolic_name_buffer,
                  sizeof(extension->symbolic_name_buffer));
  }
}

static NTSTATUS VdsCompleteIrp(PIRP irp, NTSTATUS status) {
  irp->IoStatus.Status = status;
  irp->IoStatus.Information = 0;
  IoCompleteRequest(irp, IO_NO_INCREMENT);
  return status;
}

static NTSTATUS VdsCompleteStringIoctl(PIRP irp, PCWSTR value) {
  PIO_STACK_LOCATION stack;
  ULONG output_length;
  ULONG string_bytes;
  ULONG copy_bytes;
  PVOID buffer;

  stack = IoGetCurrentIrpStackLocation(irp);
  output_length = stack->Parameters.DeviceIoControl.OutputBufferLength;
  if (value == NULL || output_length < sizeof(WCHAR) ||
      irp->MdlAddress == NULL) {
    return VdsCompleteIrp(irp, STATUS_BUFFER_TOO_SMALL);
  }

  buffer = MmGetSystemAddressForMdlSafe(irp->MdlAddress, NormalPagePriority);
  if (buffer == NULL) {
    return VdsCompleteIrp(irp, STATUS_INSUFFICIENT_RESOURCES);
  }

  string_bytes = ((ULONG)wcslen(value) + 1) * sizeof(WCHAR);
  copy_bytes = min(output_length, string_bytes);
  RtlZeroMemory(buffer, output_length);
  RtlCopyMemory(buffer, value, copy_bytes);
  ((PWCHAR)buffer)[(output_length / sizeof(WCHAR)) - 1] = L'\0';

  irp->IoStatus.Status = STATUS_SUCCESS;
  irp->IoStatus.Information = copy_bytes;
  IoCompleteRequest(irp, IO_NO_INCREMENT);
  return STATUS_SUCCESS;
}

static NTSTATUS VdsCompleteIrpWithInformation(PIRP irp, NTSTATUS status,
                                              ULONG_PTR information) {
  irp->IoStatus.Status = status;
  irp->IoStatus.Information = information;
  IoCompleteRequest(irp, IO_NO_INCREMENT);
  return status;
}

static BOOLEAN
VdsDeviceListContainsAddress(const struct vds_filter_device_list *list,
                             ULONG count, const CHAR address[18]) {
  ULONG index;

  for (index = 0; index < count; ++index) {
    if (VdsAddressEqual(list->devices[index].address, address)) {
      return TRUE;
    }
  }
  return FALSE;
}

static VOID VdsAppendDeviceListEntry(struct vds_filter_device_list *list,
                                     ULONG *count,
                                     const VDS_FILTER_EXTENSION *item) {
  if (*count >= VDS_FILTER_MAX_DEVICES ||
      (item->address[0] != '\0' &&
       VdsDeviceListContainsAddress(list, *count, item->address))) {
    return;
  }

  list->devices[*count].profile = item->profile;
  list->devices[*count].flags = VDS_FILTER_DEVICE_PRESENT;
  if (item->report_target) {
    list->devices[*count].flags |= VDS_FILTER_DEVICE_REPORT_TARGET;
  }
  if (item->report_target || item->address[0] != '\0') {
    list->devices[*count].flags |= VDS_FILTER_DEVICE_ACCESS_RESTRICTED;
  }
  RtlCopyMemory(list->devices[*count].address, item->address,
                sizeof(list->devices[*count].address));
  ++(*count);
}

static NTSTATUS VdsPassThrough(PDEVICE_OBJECT device_object, PIRP irp) {
  PVDS_FILTER_EXTENSION extension;

  extension = (PVDS_FILTER_EXTENSION)device_object->DeviceExtension;
  if (extension->is_control) {
    return VdsCompleteIrp(irp, STATUS_INVALID_DEVICE_REQUEST);
  }

  IoSkipCurrentIrpStackLocation(irp);
  return IoCallDriver(extension->lower_device, irp);
}

static BOOLEAN
VdsPhysicalAccessRestricted(const VDS_FILTER_EXTENSION *extension) {
  return extension->report_target || extension->address[0] != '\0';
}

static NTSTATUS VdsDispatchCreate(PDEVICE_OBJECT device_object, PIRP irp) {
  PVDS_FILTER_EXTENSION extension;

  extension = (PVDS_FILTER_EXTENSION)device_object->DeviceExtension;
  if (extension->is_control) {
    if (!VdsCallerIsAllowed(irp)) {
      KdPrint(("vds_filter: denied control create from %s\n",
               (const CHAR *)PsGetProcessImageFileName(PsGetCurrentProcess())));
      return VdsCompleteIrp(irp, STATUS_ACCESS_DENIED);
    }
    return VdsCompleteIrp(irp, STATUS_SUCCESS);
  }

  if (VdsPhysicalAccessRestricted(extension) && !VdsCallerIsAllowed(irp)) {
    KdPrint(("vds_filter: denied physical HID create address=%s from %s\n",
             extension->address,
             (const CHAR *)PsGetProcessImageFileName(PsGetCurrentProcess())));
    return VdsCompleteIrp(irp, STATUS_ACCESS_DENIED);
  }

  return VdsPassThrough(device_object, irp);
}

static NTSTATUS VdsDispatchPhysicalDeviceControl(PDEVICE_OBJECT device_object,
                                                 PIRP irp) {
  PVDS_FILTER_EXTENSION extension;

  extension = (PVDS_FILTER_EXTENSION)device_object->DeviceExtension;
  if (!extension->is_control && VdsPhysicalAccessRestricted(extension) &&
      !VdsCallerIsAllowed(irp)) {
    KdPrint(("vds_filter: denied physical HID ioctl address=%s from %s\n",
             extension->address,
             (const CHAR *)PsGetProcessImageFileName(PsGetCurrentProcess())));
    return VdsCompleteIrp(irp, STATUS_ACCESS_DENIED);
  }

  return VdsPassThrough(device_object, irp);
}

static NTSTATUS VdsDispatchClose(PDEVICE_OBJECT device_object, PIRP irp) {
  PVDS_FILTER_EXTENSION extension;

  extension = (PVDS_FILTER_EXTENSION)device_object->DeviceExtension;
  if (extension->is_control) {
    return VdsCompleteIrp(irp, STATUS_SUCCESS);
  }
  if (VdsPhysicalAccessRestricted(extension) &&
      irp->RequestorMode == UserMode && !VdsCallerIsAllowed(irp)) {
    return VdsCompleteIrp(irp, STATUS_SUCCESS);
  }

  return VdsPassThrough(device_object, irp);
}

static NTSTATUS VdsDispatchDeviceControl(PDEVICE_OBJECT device_object,
                                         PIRP irp) {
  PVDS_FILTER_EXTENSION extension;
  PIO_STACK_LOCATION stack;
  struct vds_filter_device_list *output;
  PLIST_ENTRY entry;
  ULONG count;
  ULONG output_length;

  extension = (PVDS_FILTER_EXTENSION)device_object->DeviceExtension;
  if (!extension->is_control) {
    stack = IoGetCurrentIrpStackLocation(irp);
    if (extension->provide_hid_strings) {
      switch (stack->Parameters.DeviceIoControl.IoControlCode) {
      case VDS_IOCTL_HID_GET_PRODUCT_STRING:
        return VdsCompleteStringIoctl(irp, extension->product_string);
      case VDS_IOCTL_HID_GET_MANUFACTURER_STRING:
        return VdsCompleteStringIoctl(irp, L"Sony Interactive Entertainment");
      case VDS_IOCTL_HID_GET_SERIALNUMBER_STRING:
        return VdsCompleteStringIoctl(irp, L"000000000000");
      default:
        break;
      }
    }
    return VdsDispatchPhysicalDeviceControl(device_object, irp);
  }

  stack = IoGetCurrentIrpStackLocation(irp);
  switch (stack->Parameters.DeviceIoControl.IoControlCode) {
  case VDS_FILTER_IOCTL_GET_DEVICES:
    break;
  default:
    return VdsCompleteIrp(irp, STATUS_INVALID_DEVICE_REQUEST);
  }

  output_length = stack->Parameters.DeviceIoControl.OutputBufferLength;
  if (output_length < sizeof(struct vds_filter_device_list)) {
    return VdsCompleteIrp(irp, STATUS_BUFFER_TOO_SMALL);
  }

  output = (struct vds_filter_device_list *)irp->AssociatedIrp.SystemBuffer;
  RtlZeroMemory(output, sizeof(*output));
  output->version = VDS_FILTER_DEVICE_LIST_VERSION;
  output->size = sizeof(*output);

  ExAcquireFastMutex(&vds_device_list_lock);
  count = 0;
  for (entry = vds_device_list.Flink;
       entry != &vds_device_list && count < VDS_FILTER_MAX_DEVICES;
       entry = entry->Flink) {
    PVDS_FILTER_EXTENSION item =
        CONTAINING_RECORD(entry, VDS_FILTER_EXTENSION, list_entry);
    if (item->report_target) {
      VdsAppendDeviceListEntry(output, &count, item);
    }
  }
  for (entry = vds_device_list.Flink;
       entry != &vds_device_list && count < VDS_FILTER_MAX_DEVICES;
       entry = entry->Flink) {
    PVDS_FILTER_EXTENSION item =
        CONTAINING_RECORD(entry, VDS_FILTER_EXTENSION, list_entry);
    if (!item->report_target) {
      VdsAppendDeviceListEntry(output, &count, item);
    }
  }
  ExReleaseFastMutex(&vds_device_list_lock);

  output->count = count;
  irp->IoStatus.Status = STATUS_SUCCESS;
  irp->IoStatus.Information = sizeof(*output);
  IoCompleteRequest(irp, IO_NO_INCREMENT);
  return STATUS_SUCCESS;
}

static NTSTATUS VdsPnpCompletion(PDEVICE_OBJECT device_object, PIRP irp,
                                 PVOID context) {
  UNREFERENCED_PARAMETER(device_object);
  UNREFERENCED_PARAMETER(irp);

  KeSetEvent((PKEVENT)context, IO_NO_INCREMENT, FALSE);
  return STATUS_MORE_PROCESSING_REQUIRED;
}

static NTSTATUS VdsDispatchPnp(PDEVICE_OBJECT device_object, PIRP irp) {
  PVDS_FILTER_EXTENSION extension;
  PIO_STACK_LOCATION stack;
  PDEVICE_OBJECT lower_device;
  KEVENT event;
  NTSTATUS status;

  extension = (PVDS_FILTER_EXTENSION)device_object->DeviceExtension;
  if (extension->is_control) {
    return VdsCompleteIrp(irp, STATUS_INVALID_DEVICE_REQUEST);
  }

  stack = IoGetCurrentIrpStackLocation(irp);
  if (stack->MinorFunction == IRP_MN_START_DEVICE) {
    KeInitializeEvent(&event, NotificationEvent, FALSE);
    IoCopyCurrentIrpStackLocationToNext(irp);
    IoSetCompletionRoutine(irp, VdsPnpCompletion, &event, TRUE, TRUE, TRUE);
    status = IoCallDriver(extension->lower_device, irp);
    if (status == STATUS_PENDING) {
      KeWaitForSingleObject(&event, Executive, KernelMode, FALSE, NULL);
      status = irp->IoStatus.Status;
    }
    if (NT_SUCCESS(status)) {
      VdsReadPhysicalDeviceProfile(extension->physical_device, extension);
      VdsUpdateDeviceListMembership(extension);
      VdsUpdateSymbolicLink(extension);
      KdPrint(("vds_filter: started Bluetooth HID stack address=%s "
               "profile=%lu report_target=%u listed=%u\n",
               extension->address, extension->profile, extension->report_target,
               extension->listed));
    }
    irp->IoStatus.Status = status;
    IoCompleteRequest(irp, IO_NO_INCREMENT);
    return status;
  }

  if (stack->MinorFunction != IRP_MN_REMOVE_DEVICE) {
    return VdsPassThrough(device_object, irp);
  }

  ExAcquireFastMutex(&vds_device_list_lock);
  if (extension->listed) {
    RemoveEntryList(&extension->list_entry);
    InitializeListHead(&extension->list_entry);
    extension->listed = FALSE;
  }
  ExReleaseFastMutex(&vds_device_list_lock);
  VdsDeleteSymbolicLink(extension);

  lower_device = extension->lower_device;
  KeInitializeEvent(&event, NotificationEvent, FALSE);
  IoCopyCurrentIrpStackLocationToNext(irp);
  IoSetCompletionRoutine(irp, VdsPnpCompletion, &event, TRUE, TRUE, TRUE);
  status = IoCallDriver(lower_device, irp);
  if (status == STATUS_PENDING) {
    KeWaitForSingleObject(&event, Executive, KernelMode, FALSE, NULL);
    status = irp->IoStatus.Status;
  }
  IoDetachDevice(lower_device);
  IoDeleteDevice(device_object);
  irp->IoStatus.Status = status;
  IoCompleteRequest(irp, IO_NO_INCREMENT);
  return status;
}

static NTSTATUS VdsDispatchPower(PDEVICE_OBJECT device_object, PIRP irp) {
  PVDS_FILTER_EXTENSION extension;

  extension = (PVDS_FILTER_EXTENSION)device_object->DeviceExtension;
  if (extension->is_control) {
    return VdsCompleteIrp(irp, STATUS_SUCCESS);
  }

  IoSkipCurrentIrpStackLocation(irp);
  return PoCallDriver(extension->lower_device, irp);
}

static NTSTATUS VdsAddDevice(PDRIVER_OBJECT driver_object,
                             PDEVICE_OBJECT physical_device_object) {
  PVDS_FILTER_EXTENSION extension;
  PDEVICE_OBJECT filter_device;
  UNICODE_STRING device_name;
  WCHAR device_name_buffer[64];
  LONG instance_index;
  NTSTATUS status;

  instance_index = InterlockedIncrement(&vds_next_filter_instance) - 1;
  status =
      RtlStringCchPrintfW(device_name_buffer, RTL_NUMBER_OF(device_name_buffer),
                          L"\\Device\\VdsFilterHid%ld", instance_index);
  if (!NT_SUCCESS(status)) {
    return status;
  }
  RtlInitUnicodeString(&device_name, device_name_buffer);

  status =
      IoCreateDevice(driver_object, sizeof(VDS_FILTER_EXTENSION), &device_name,
                     FILE_DEVICE_UNKNOWN, 0, FALSE, &filter_device);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  extension = (PVDS_FILTER_EXTENSION)filter_device->DeviceExtension;
  RtlZeroMemory(extension, sizeof(*extension));
  InitializeListHead(&extension->list_entry);
  (void)RtlStringCchCopyW(extension->device_name_buffer,
                          RTL_NUMBER_OF(extension->device_name_buffer),
                          device_name_buffer);
  extension->filter_device = filter_device;
  extension->physical_device = physical_device_object;
  VdsReadPhysicalDeviceProfile(physical_device_object, extension);
  extension->lower_device =
      IoAttachDeviceToDeviceStack(filter_device, physical_device_object);
  if (extension->lower_device == NULL) {
    IoDeleteDevice(filter_device);
    return STATUS_NO_SUCH_DEVICE;
  }

  filter_device->Flags |= extension->lower_device->Flags &
                          (DO_BUFFERED_IO | DO_DIRECT_IO | DO_POWER_PAGABLE);
  filter_device->Flags &= ~DO_DEVICE_INITIALIZING;

  VdsUpdateDeviceListMembership(extension);
  VdsUpdateSymbolicLink(extension);

  KdPrint(("vds_filter: attached to Bluetooth HID stack address=%s "
           "profile=%lu report_target=%u\n",
           extension->address, extension->profile, extension->report_target));
  return STATUS_SUCCESS;
}

static NTSTATUS VdsCreateControlDevice(PDRIVER_OBJECT driver_object) {
  UNICODE_STRING device_name;
  UNICODE_STRING symbolic_name;
  PVDS_FILTER_EXTENSION extension;
  NTSTATUS status;

  RtlInitUnicodeString(&device_name, VDS_FILTER_DEVICE_NAME);
  RtlInitUnicodeString(&symbolic_name, VDS_FILTER_SYMBOLIC_NAME);
  (void)IoDeleteSymbolicLink(&symbolic_name);

  status =
      IoCreateDevice(driver_object, sizeof(VDS_FILTER_EXTENSION), &device_name,
                     FILE_DEVICE_UNKNOWN, 0, FALSE, &vds_control_device);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  extension = (PVDS_FILTER_EXTENSION)vds_control_device->DeviceExtension;
  RtlZeroMemory(extension, sizeof(*extension));
  extension->is_control = TRUE;
  InitializeListHead(&extension->list_entry);
  vds_control_device->Flags |= DO_BUFFERED_IO;

  status = IoCreateSymbolicLink(&symbolic_name, &device_name);
  if (!NT_SUCCESS(status)) {
    IoDeleteDevice(vds_control_device);
    vds_control_device = NULL;
    return status;
  }

  vds_control_device->Flags &= ~DO_DEVICE_INITIALIZING;
  return STATUS_SUCCESS;
}

static VOID VdsUnload(PDRIVER_OBJECT driver_object) {
  UNICODE_STRING symbolic_name;

  UNREFERENCED_PARAMETER(driver_object);

  if (vds_control_device != NULL) {
    RtlInitUnicodeString(&symbolic_name, VDS_FILTER_SYMBOLIC_NAME);
    IoDeleteSymbolicLink(&symbolic_name);
    IoDeleteDevice(vds_control_device);
    vds_control_device = NULL;
  }
}

NTSTATUS DriverEntry(PDRIVER_OBJECT driver_object,
                     PUNICODE_STRING registry_path) {
  ULONG index;
  NTSTATUS status;

  UNREFERENCED_PARAMETER(registry_path);

  ExInitializeFastMutex(&vds_device_list_lock);
  InitializeListHead(&vds_device_list);

  for (index = 0; index <= IRP_MJ_MAXIMUM_FUNCTION; ++index) {
    driver_object->MajorFunction[index] = VdsPassThrough;
  }
  driver_object->MajorFunction[IRP_MJ_CREATE] = VdsDispatchCreate;
  driver_object->MajorFunction[IRP_MJ_CLOSE] = VdsDispatchClose;
  driver_object->MajorFunction[IRP_MJ_CLEANUP] = VdsDispatchClose;
  driver_object->MajorFunction[IRP_MJ_DEVICE_CONTROL] =
      VdsDispatchDeviceControl;
  driver_object->MajorFunction[IRP_MJ_INTERNAL_DEVICE_CONTROL] =
      VdsDispatchPhysicalDeviceControl;
  driver_object->MajorFunction[IRP_MJ_PNP] = VdsDispatchPnp;
  driver_object->MajorFunction[IRP_MJ_POWER] = VdsDispatchPower;
  driver_object->DriverExtension->AddDevice = VdsAddDevice;
  driver_object->DriverUnload = VdsUnload;

  status = VdsCreateControlDevice(driver_object);
  if (!NT_SUCCESS(status)) {
    return status;
  }

  return STATUS_SUCCESS;
}

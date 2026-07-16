import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type TablerIcon,
  IconAdjustmentsSpark,
  IconActivity as Activity,
  IconArrowLeft,
  IconAdjustmentsHorizontal as Settings2,
  IconAdjustmentsHorizontal as SlidersHorizontal,
  IconAlertHexagon,
  IconAlertTriangle,
  IconArrowRight as ArrowRight,
  IconBatteryEco,
  IconBell as Bell,
  IconBinary,
  IconBolt as Zap,
  IconBooks,
  IconBulb,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconChevronLeft as ChevronLeft,
  IconCircleCheck,
  IconCpu,
  IconDeviceFloppy as Save,
  IconDeviceGamepad2,
  IconDeviceGamepad3,
  IconDownload,
  IconFlame,
  IconBrandDeezer,
  IconDeviceAudioTape,
  IconBrandXbox,
  IconBrandGithub,
  IconHeart as Heart,
  IconDeviceMobileVibration as Vibrate,
  IconHeadphones as Headphones,
  IconKeyboard as Keyboard,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconLink as LinkIcon,
  IconLinkOff as LinkOffIcon,
  IconMicrophone as Mic,
  IconMicrophoneOff as MicOff,
  IconMinus as Minus,
  IconMoon as Moon,
  IconPalette as Palette,
  IconPencil as Pencil,
  IconPhoto,
  IconPlayerPlay as Play,
  IconPlus as Plus,
  IconQuestionMark,
  IconRadioactive,
  IconRefresh as RefreshCcw,
  IconReplace,
  IconSearch as SearchIcon,
  IconSettings as SettingsIcon,
  IconBluetooth,
  IconSparkleHighlight,
  IconSparkles as Sparkles,
  IconStethoscope,
  IconTargetArrow,
  IconTestPipe,
  IconTool,
  IconTrash as Trash2,
  IconUpload,
  IconUsb,
  IconVolume,
  IconVolume as Volume2,
  IconVolumeOff as VolumeX,
  IconX as X
} from '@tabler/icons-react';
import playStationLogoUrl from '../../../assets/brand/playstation-logo.svg';
import controllerImage from '../../../assets/controllers/dualsense-edge-front.svg';
import remappingEdgeLayoutImage from '../../../assets/controllers/dualsense-edge-remapping-layout.svg';
import remappingLayoutImage from '../../../assets/controllers/dualsense-remapping-layout.svg';
import circleGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Circle.svg';
import createGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Create.svg';
import crossGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Cross.svg';
import dpadDownGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Down.svg';
import dpadLeftGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Left.svg';
import dpadRightGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Right.svg';
import dpadUpGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Up.svg';
import l1GlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/L1.svg';
import l2GlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/L2.svg';
import leftStickClickGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Left Stick Click.svg';
import optionsGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Options.svg';
import psHomeGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Home.svg';
import r1GlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/R1.svg';
import r2GlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/R2.svg';
import rightStickClickGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Right Stick Click.svg';
import squareGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Square.svg';
import triangleGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Triangle.svg';
import testSpeakerToneUrl from './assets/test-speaker-tone-silence-tail.mp3';
import {
  DEFAULT_UI_THEME_PRESET,
  UI_THEME_KOFI_BADGES,
  UI_THEME_OPTIONS,
  UI_THEME_PREVIEW_SWATCHES
} from './ui-themes';
import {
  CHORD_CONTROLLER_SETTING_STEP_DEFAULT,
  CHORD_CONTROLLER_SETTING_STEP_MAX,
  CHORD_CONTROLLER_SETTING_STEP_MIN,
  CHORD_MUTE_STARTER_ID,
  DEFAULT_BUTTON_REMAP_PROFILE_ID,
  DEFAULT_CONTROLLER_PROFILE_ID,
  MAX_CHORD_ASSIGNMENTS,
  MAX_CHORD_FUNCTION_NAME_LENGTH,
  MAX_KEYBOARD_FUNCTION_KEYS,
  REMAP_BUTTON_IDS,
  ackResultName,
  normalizeChordControllerSettingStepPercent,
  isChordBindingAllowed
} from '../shared/protocol';
import { gameSettingsProfileId, isGameSettingsProfileId } from '../shared/game-settings';
import type {
  AudioReactiveHapticsBassFocus,
  AudioReactiveHapticsConfig,
  AudioReactiveHapticsMode,
  AudioReactiveHapticsSource,
  AudioReactiveHapticsAttack,
  AudioReactiveHapticsRelease,
  AudioReactiveHapticsResponse,
  ChordAssignment,
  ChordAssignableButtonId,
  ChordControllerSettingAction,
  ChordFunction,
  ChordFunctionType,
  ChordMediaAction,
  ChordStarterId,
  ControllerProfileSettings,
  HostPersonaMode,
  MuteButtonMode,
  MuteKeyboardBehavior,
  PollingRateMode,
  BridgeStatusPayload,
  RemapButtonId,
  TriggerTestMode,
  TriggerTestTarget
} from '../shared/protocol';
import type { AudioHapticsSession, BridgeSnapshot, UiScalePercent, UiThemePreset } from '../shared/types';
import type { UpdateState } from '../main/update-service';
import { UpdateToast } from './UpdateToast';
import {
  createDefaultProfile,
  DEFAULT_PROFILE_ID,
  defaultEffectForMode,
  KNOWN_BUTTONS,
  MAX_STATE_NAME_LENGTH,
  MAX_STATES_PER_PROFILE,
  slugifyTriggerProfileName,
  uniqueTriggerProfileId
} from '../shared/trigger-profiles';

export { slugifyTriggerProfileName, uniqueTriggerProfileId };
import type {
  EngineStatus,
  InputConditionType,
  StateSwitchAction,
  StateSwitchRule,
  StateSwitching,
  TriggerEffectSpec,
  TriggerModifier,
  TriggerProfile,
  TriggerSlotPair,
  TriggerStateDef
} from '../shared/trigger-profiles';
import type { GameProcessCandidate } from '../main/game-watcher';
import type { GameSettingsStatus } from '../main/game-settings-coordinator';
import type { InstalledGamesList } from '../preload';
import type { GameArtworkSearchResult } from '../main/game-artwork';
import type { LibraryCatalog, LibraryEntry } from '../main/profile-library';
import { profileVariantLabel } from './library-entry';
import { filterLibrary } from './library-search';
import { matchGameInLibrary, nativeGameFeatureMap, nativeGameFeatures } from './game-library-match';
import { TriggerEffectEditor } from './TriggerEffectEditor';
import { StickWheelEditor, type StickSample } from './StickWheelEditor';

type ControlTab = 'game-profile' | 'overview' | 'haptics' | 'audio' | 'triggers' | 'trigger-profiles' | 'lighting' | 'remapping' | 'chords' | 'system';
type StartupTutorialStep = 'feature-toggle' | 'done';
type ControllerType = BridgeStatusPayload['controllerType'];
type KnownControllerType = Exclude<ControllerType, 'unknown'>;
type RemapButtonDefinition = {
  id: RemapButtonId;
  label: string;
  glyphUrl?: string;
  textGlyph?: string;
};
type ChordStarterDefinition = {
  id: ChordStarterId;
  label: string;
  glyphUrl?: string;
  textGlyph?: string;
  Icon?: TablerIcon;
};
type TargetOnlyRemapButtonId = Extract<RemapButtonId, 'ps'>;
type SourceRemapButtonId = Exclude<RemapButtonId, TargetOnlyRemapButtonId>;
type DualSenseEdgeRemapButtonId = Extract<SourceRemapButtonId, 'lb' | 'rb' | 'lfn' | 'rfn'>;
type StandardRemapButtonId = Exclude<SourceRemapButtonId, DualSenseEdgeRemapButtonId>;
type RemapProfileDialogMode = 'save' | 'rename' | 'delete';
type ControllerProfileDialogMode = 'save' | 'rename' | 'delete';
type ChordFunctionDraft = {
  id: string;
  name: string;
  type: ChordFunctionType;
  keyboardKey: string;
  keyboardModifiers: ChordKeyboardModifier[];
  mediaAction: ChordMediaAction;
  controllerAction: ChordControllerSettingAction;
  controllerStepPercent: number;
};
type ChordKeyboardModifier = 'Ctrl' | 'Shift' | 'Alt' | 'Win';
type ChordNotchTargetId = 'speaker' | 'mic' | 'haptics' | 'rumble' | 'triggers' | 'lighting';
type ChordNotchDirection = 'down' | 'up';
type ChordNotchAction = Extract<ChordControllerSettingAction, `${ChordNotchTargetId}-${ChordNotchDirection}`>;
type ChordControllerSettingSelectValue = Exclude<ChordControllerSettingAction, ChordNotchAction> | ChordNotchTargetId;
type ChordFunctionDialogMode = 'rename' | 'delete';
type ChordFunctionDialogState = {
  mode: ChordFunctionDialogMode;
  functionId: string;
};
const CHORD_UNASSIGNED_BUTTON = '__unassigned__';
type ChordButtonSelectValue = ChordAssignableButtonId | typeof CHORD_UNASSIGNED_BUTTON;
type ChordAssignmentDraftRow = {
  id: string;
  starter: ChordStarterId;
  button: ChordAssignableButtonId | null;
  functionId: string;
};
type ChordAssignmentDropHint = {
  targetId: string;
  placement: 'before' | 'after';
};
type ChordAssignmentDragSession = {
  active: boolean;
  id: string;
  offsetX: number;
  offsetY: number;
  overlay: HTMLElement | null;
  startX: number;
  startY: number;
  cleanup: () => void;
  dropHint: ChordAssignmentDropHint | null;
};
type ChordAssignmentScrollbarState = {
  visible: boolean;
  top: number;
  height: number;
};
type TriggerProfileSlotKey = 'l2' | 'r2';
type TriggerProfileDeleteConfirmState = {
  id: string;
  name: string;
};
type RemapCalloutLayout = {
  top: number;
  points: string;
};
type EdgeRemapControlLayout = {
  left: number;
  top: number;
  anchor: 'top' | 'bottom';
  linePoints: string;
};
type LightbarPaletteCell = {
  color: string;
  name: string;
};
type FeatureTipsPanelProps = {
  tab: 'audio' | 'haptics' | 'triggers' | 'lighting';
  onSettingsFocusRequest?: (target: SettingsFocusTarget) => void;
  audioHapticsOpen?: boolean;
};
type SettingsFocusTarget = 'controller-power-saving' | 'sleep-shortcut' | 'volume-shortcut';
type NotificationFocusTarget = 'controller-status' | 'low-battery' | 'all';

const HAPTICS_STEP = 20;
const STANDARD_FEEDBACK_GAIN_PERCENT = 200;
const BOOSTED_FEEDBACK_GAIN_PERCENT = 500;
const SPEAKER_VOLUME_STEP = 10;
const MIC_VOLUME_STEP = 10;
const AUDIO_BUFFER_LENGTH_MIN = 16;
const AUDIO_BUFFER_LENGTH_MAX = 128;
const AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX = 44;
const AUDIO_BUFFER_LENGTH_RISKY_MAX = 63;
const LIGHTBAR_BRIGHTNESS_STEP = 10;
const TRIGGER_EFFECT_STEP = 10;
const CONTROLLER_POWER_SAVING_CAP_PERCENT = 60;
const TEST_HAPTICS_LOCK_MS = 1100;
const TEST_SPEAKER_LOCK_MS = 900;
const TEST_MIC_LISTEN_MS = 5000;
const TEST_SPEAKER_VOLUME_SETTLE_MS = 90;
const TEST_SPEAKER_ENDPOINT_ATTEMPTS = 12;
const TEST_SPEAKER_ENDPOINT_RETRY_MS = 150;
const TEST_SPEAKER_ENDPOINT_REFRESH_MS = 1500;
const TEST_SPEAKER_ENDPOINT_VERIFY_MS = 100;
const TEST_SPEAKER_PREROLL_MS = 220;
const TEST_TRIGGER_LOCK_MS = 2800;
const SLEEP_CONFIRM_MS = 2400;
const LIGHTBAR_SWATCHES = ['#ffff00', '#0000ff', '#00ff00', '#ff0000', '#8000ff', '#ffffff'];
const LIGHTBAR_SWATCH_NAMES: Record<string, string> = {
  '#ffff00': 'Yellow',
  '#0000ff': 'Blue',
  '#00ff00': 'Green',
  '#ff0000': 'Red',
  '#8000ff': 'Violet',
  '#ffffff': 'White'
};
const LIGHTBAR_DEFAULT_CUSTOM_COLOR = '#7b61ff';
const LIGHTBAR_CUSTOM_PALETTE = makeLightbarCustomPalette();
const LIGHTBAR_COLOR_NAMES = makeLightbarColorNames();
const LIGHTBAR_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 50],
  ['High', 100]
];
const HAPTICS_PRESETS: Array<[string, number]> = [
  ['Low', 50],
  ['Medium', 100],
  ['High', 150]
];
const SPEAKER_VOLUME_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 70],
  ['High', 100]
];
const MIC_VOLUME_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 70],
  ['High', 100]
];
const TRIGGER_EFFECT_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 70],
  ['High', 100]
];
const PERCENT_SLIDER_TICKS = Array.from({ length: 11 }, (_, index) => index * 10);
const STANDARD_HAPTICS_SLIDER_TICKS = Array.from({ length: 11 }, (_, index) => index * 20);
const BRIDGE_AUDIO_OUTPUT_RE = /ds5|dualsense|dual sense|wireless controller|bridge/i;
const BRIDGE_AUDIO_INPUT_RE = /ds5|dualsense|dual sense|wireless controller|bridge/i;
const BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE = 'DualSense audio endpoint unavailable';
const BRIDGE_MIC_ENDPOINT_UNAVAILABLE = 'DualSense microphone unavailable';
const MUTE_KEY_OPTIONS: Array<[string, number]> = [
  ['F1', 0x3A], ['F2', 0x3B], ['F3', 0x3C], ['F4', 0x3D], ['F5', 0x3E], ['F6', 0x3F],
  ['F7', 0x40], ['F8', 0x41], ['F9', 0x42], ['F10', 0x43], ['F11', 0x44], ['F12', 0x45],
  ['F13', 0x68], ['F14', 0x69], ['F15', 0x6A], ['F16', 0x6B], ['F17', 0x6C], ['F18', 0x6D],
  ['F19', 0x6E], ['F20', 0x6F], ['F21', 0x70], ['F22', 0x71], ['F23', 0x72], ['F24', 0x73],
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter, index) => [letter, 0x04 + index] as [string, number]),
  ['1', 0x1E], ['2', 0x1F], ['3', 0x20], ['4', 0x21], ['5', 0x22],
  ['6', 0x23], ['7', 0x24], ['8', 0x25], ['9', 0x26], ['0', 0x27],
  ['Enter', 0x28], ['Escape', 0x29], ['Backspace', 0x2A], ['Tab', 0x2B], ['Space', 0x2C],
  ['-', 0x2D], ['=', 0x2E], ['[', 0x2F], [']', 0x30], ['\\', 0x31],
  [';', 0x33], ["'", 0x34], ['`', 0x35], [',', 0x36], ['.', 0x37], ['/', 0x38],
  ['Insert', 0x49], ['Home', 0x4A], ['Page Up', 0x4B], ['Delete', 0x4C], ['End', 0x4D], ['Page Down', 0x4E],
  ['Right Arrow', 0x4F], ['Left Arrow', 0x50], ['Down Arrow', 0x51], ['Up Arrow', 0x52]
];
const MUTE_MODIFIER_OPTIONS: Array<[string, number]> = [
  ['Ctrl', 0x01],
  ['Shift', 0x02],
  ['Alt', 0x04],
  ['Win', 0x08]
];
// The daemon's short-test/preview commands (0x0D / 0x1F) only understand the
// three classic V1 arms; the richer modes preview through profile drafts.
const TRIGGER_LAB_TESTABLE_MODES: TriggerTestMode[] = ['feedback', 'weapon', 'vibration'];
const TRIGGER_PROFILE_SLOTS: Array<[TriggerProfileSlotKey, string]> = [
  ['l2', 'L2'],
  ['r2', 'R2']
];
const TRIGGER_PROFILE_CONDITION_OPTIONS: Array<[string, InputConditionType]> = [
  ['Trigger Held Over', 'trigger-held-over'],
  ['Trigger Full Pull', 'trigger-full-pull'],
  ['Button Held', 'button-held'],
  ['Rapid Fire', 'rapid-fire']
];
const STATE_SWITCH_BUTTON_LABELS: Record<string, string> = {
  cross: 'Cross', circle: 'Circle', triangle: 'Triangle', square: 'Square',
  l1: 'L1', r1: 'R1', l3: 'L3', r3: 'R3',
  create: 'Create', options: 'Options', ps: 'PS',
  'dpad-up': 'D-Pad Up', 'dpad-down': 'D-Pad Down',
  'dpad-left': 'D-Pad Left', 'dpad-right': 'D-Pad Right'
};
const STATE_SWITCH_BUTTON_OPTIONS: Array<[string, string]> = KNOWN_BUTTONS.map(
  (button) => [STATE_SWITCH_BUTTON_LABELS[button] ?? button, button]
);
const STATE_SWITCH_WHILE_OPTIONS: Array<[string, string]> = [
  ['No chord', ''],
  ...STATE_SWITCH_BUTTON_OPTIONS
];
const STATE_SWITCH_MENU_OPTIONS: Array<[string, string]> = [
  ['No menu guard', ''],
  ...STATE_SWITCH_BUTTON_OPTIONS
];
const STATE_SWITCH_ACTION_OPTIONS: Array<[string, StateSwitchAction]> = [
  ['Cycle to next state', 'cycle'],
  ['Select a state', 'select']
];
const MUTE_BUTTON_MODE_OPTIONS: Array<[string, MuteButtonMode]> = [
  ['Normal', 'normal'],
  ['Keyboard Key', 'keyboard'],
  ['Quiet Toggle', 'quiet'],
  ['Chord', 'chord']
];
const MUTE_KEYBOARD_BEHAVIOR_OPTIONS: Array<[string, MuteKeyboardBehavior]> = [
  ['Tap Once', 'tap'],
  ['Hold While Pressed', 'hold']
];
const POLLING_RATE_OPTIONS: Array<[string, PollingRateMode]> = [
  ['1000 Hz / Real-time', '1000'],
  ['500 Hz', '500'],
  ['250 Hz', '250']
];
const HOST_PERSONA_OPTIONS: Array<[string, HostPersonaMode]> = [
  ['DualSense', 'dualsense'],
  ['DualShock 4', 'ds4'],
  ['Xbox', 'xbox']
];
const SPEAKER_GAIN_OPTIONS: Array<[string, number]> = [
  ['1', 1],
  ['2', 2],
  ['3', 3],
  ['4', 4],
  ['5', 5],
  ['6', 6],
  ['7', 7]
];
const AUDIO_REACTIVE_HAPTICS_MODE_OPTIONS: Array<[string, AudioReactiveHapticsMode]> = [
  ['Mix', 'mix'],
  ['Replace', 'replace']
];
const AUDIO_REACTIVE_HAPTICS_BASS_FOCUS_OPTIONS: Array<[string, AudioReactiveHapticsBassFocus]> = [
  ['80 Hz', 'deep'],
  ['160 Hz', 'balanced'],
  ['240 Hz', 'punchy'],
  ['400 Hz', 'wide']
];
const AUDIO_REACTIVE_HAPTICS_RESPONSE_OPTIONS: Array<[string, AudioReactiveHapticsResponse]> = [
  ['Subtle', 'subtle'],
  ['Dynamic', 'balanced'],
  ['Aggressive', 'strong']
];
const AUDIO_REACTIVE_HAPTICS_ATTACK_OPTIONS: Array<[string, AudioReactiveHapticsAttack]> = [
  ['Slow Ramp', 'soft'],
  ['Medium Ramp', 'balanced'],
  ['Fast Ramp', 'fast'],
  ['Instant Ramp', 'sharp']
];
const AUDIO_REACTIVE_HAPTICS_RELEASE_OPTIONS: Array<[string, AudioReactiveHapticsRelease]> = [
  ['Fast Fade', 'tight'],
  ['Medium Fade', 'balanced'],
  ['Slow Fade', 'smooth'],
  ['Long Fade', 'long']
];
const AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS = {
  bassFocus: 'Applies a low-pass filter that chooses which part of the low-end audio becomes vibration.',
  response: 'Controls how strongly haptics react to audio, especially louder peaks.',
  attack: 'Controls how quickly the haptics ramp when a sound rises or spikes.',
  release: 'Controls how quickly the haptics fade when a sound drops.'
} as const;
const IDLE_DISCONNECT_TIMEOUT_OPTIONS: Array<[string, number]> = [
  ['5 min', 5],
  ['15 min', 15],
  ['30 min', 30]
];
const UI_SCALE_OPTIONS: Array<[string, UiScalePercent]> = [
  ['75%', 75],
  ['100%', 100],
  ['125%', 125],
  ['150%', 150]
];
const REMAP_BUTTONS: Record<RemapButtonId, RemapButtonDefinition> = {
  l2: { id: 'l2', label: 'L2', glyphUrl: l2GlyphUrl },
  l1: { id: 'l1', label: 'L1', glyphUrl: l1GlyphUrl },
  create: { id: 'create', label: 'Create', glyphUrl: createGlyphUrl },
  'dpad-up': { id: 'dpad-up', label: 'D-pad Up', glyphUrl: dpadUpGlyphUrl },
  'dpad-left': { id: 'dpad-left', label: 'D-pad Left', glyphUrl: dpadLeftGlyphUrl },
  'dpad-down': { id: 'dpad-down', label: 'D-pad Down', glyphUrl: dpadDownGlyphUrl },
  'dpad-right': { id: 'dpad-right', label: 'D-pad Right', glyphUrl: dpadRightGlyphUrl },
  l3: { id: 'l3', label: 'L3', glyphUrl: leftStickClickGlyphUrl },
  r2: { id: 'r2', label: 'R2', glyphUrl: r2GlyphUrl },
  r1: { id: 'r1', label: 'R1', glyphUrl: r1GlyphUrl },
  options: { id: 'options', label: 'Options', glyphUrl: optionsGlyphUrl },
  triangle: { id: 'triangle', label: 'Triangle', glyphUrl: triangleGlyphUrl },
  circle: { id: 'circle', label: 'Circle', glyphUrl: circleGlyphUrl },
  cross: { id: 'cross', label: 'Cross', glyphUrl: crossGlyphUrl },
  square: { id: 'square', label: 'Square', glyphUrl: squareGlyphUrl },
  r3: { id: 'r3', label: 'R3', glyphUrl: rightStickClickGlyphUrl },
  lb: { id: 'lb', label: 'Left Back Button', textGlyph: 'LB' },
  rb: { id: 'rb', label: 'Right Back Button', textGlyph: 'RB' },
  lfn: { id: 'lfn', label: 'Left Function Button', textGlyph: 'LFN' },
  rfn: { id: 'rfn', label: 'Right Function Button', textGlyph: 'RFN' },
  ps: { id: 'ps', label: 'PS Button', glyphUrl: psHomeGlyphUrl }
};
const REMAP_LEFT_BUTTON_IDS: StandardRemapButtonId[] = ['l2', 'l1', 'create', 'dpad-up', 'dpad-right', 'dpad-down', 'dpad-left', 'l3'];
const REMAP_RIGHT_BUTTON_IDS: StandardRemapButtonId[] = ['r2', 'r1', 'options', 'triangle', 'circle', 'cross', 'r3', 'square'];
const REMAP_STANDARD_BUTTON_IDS: StandardRemapButtonId[] = [
  ...REMAP_LEFT_BUTTON_IDS,
  ...REMAP_RIGHT_BUTTON_IDS
];
const REMAP_EDGE_TOP_BUTTON_IDS: DualSenseEdgeRemapButtonId[] = ['lb', 'rb'];
const REMAP_EDGE_BOTTOM_BUTTON_IDS: DualSenseEdgeRemapButtonId[] = ['lfn', 'rfn'];
const REMAP_EDGE_BUTTON_IDS: DualSenseEdgeRemapButtonId[] = [
  ...REMAP_EDGE_TOP_BUTTON_IDS,
  ...REMAP_EDGE_BOTTOM_BUTTON_IDS
];
const REMAP_STANDARD_TARGET_BUTTON_IDS: StandardRemapButtonId[] = [
  'triangle',
  'circle',
  'cross',
  'square',
  'dpad-up',
  'dpad-right',
  'dpad-down',
  'dpad-left',
  'l1',
  'r1',
  'l2',
  'r2',
  'l3',
  'r3',
  'create',
  'options'
];
const REMAP_TARGET_BUTTON_IDS: RemapButtonId[] = [
  ...REMAP_STANDARD_TARGET_BUTTON_IDS,
  'ps'
];
const CHORD_BUTTON_MENU_IDS: ChordAssignableButtonId[] = [
  ...REMAP_STANDARD_TARGET_BUTTON_IDS,
  'lb',
  'rb'
];
const REMAP_ALL_BUTTON_IDS = [...REMAP_BUTTON_IDS] as RemapButtonId[];
const REMAP_TARGET_OPTIONS: Array<[string, RemapButtonId]> = [
  ...REMAP_TARGET_BUTTON_IDS
].map((id) => [REMAP_BUTTONS[id].label, id]);
const CHORD_STARTERS: Record<ChordStarterId, ChordStarterDefinition> = {
  ps: { id: 'ps', label: 'PS Button', glyphUrl: psHomeGlyphUrl },
  lfn: { id: 'lfn', label: 'LFN', textGlyph: 'LFN' },
  rfn: { id: 'rfn', label: 'RFN', textGlyph: 'RFN' },
  mute: { id: CHORD_MUTE_STARTER_ID, label: 'Mute Button', Icon: MicOff }
};
const CHORD_STARTER_OPTIONS: Array<[string, ChordStarterId]> = [
  [CHORD_STARTERS.ps.label, 'ps'],
  [CHORD_STARTERS.lfn.label, 'lfn'],
  [CHORD_STARTERS.rfn.label, 'rfn'],
  [CHORD_STARTERS.mute.label, CHORD_MUTE_STARTER_ID]
];
const CHORD_FUNCTION_TYPE_OPTIONS: Array<[string, ChordFunctionType]> = [
  ['Keyboard Shortcut', 'keyboard'],
  ['Media Action', 'media'],
  ['Controller Setting', 'controller-setting']
];
const CHORD_MEDIA_ACTION_OPTIONS: Array<[string, ChordMediaAction]> = [
  ['Play / Pause', 'play-pause'],
  ['Next Track', 'next-track'],
  ['Previous Track', 'previous-track'],
  ['Mute Output', 'mute'],
  ['Volume Up', 'volume-up'],
  ['Volume Down', 'volume-down']
];
const CHORD_NOTCH_TARGETS: Array<{
  id: ChordNotchTargetId;
  label: string;
  downAction: ChordNotchAction;
  upAction: ChordNotchAction;
}> = [
  { id: 'speaker', label: 'Speaker', downAction: 'speaker-down', upAction: 'speaker-up' },
  { id: 'mic', label: 'Mic', downAction: 'mic-down', upAction: 'mic-up' },
  { id: 'haptics', label: 'Haptics', downAction: 'haptics-down', upAction: 'haptics-up' },
  { id: 'rumble', label: 'Rumble', downAction: 'rumble-down', upAction: 'rumble-up' },
  { id: 'triggers', label: 'Triggers', downAction: 'triggers-down', upAction: 'triggers-up' },
  { id: 'lighting', label: 'Lighting', downAction: 'lighting-down', upAction: 'lighting-up' }
];
const CHORD_CONTROLLER_SETTING_ACTION_OPTIONS: Array<[string, ChordControllerSettingSelectValue]> = [
  ['Audio Haptics', 'toggle-audio-haptics'],
  ['Lightbar Override', 'toggle-lightbar-override'],
  ['Mic Mute', 'toggle-mic-mute'],
  ['Sleep Controller', 'sleep-controller'],
  ['DualSense', 'persona-dualsense'],
  ['DualShock 4', 'persona-ds4'],
  ['Xbox', 'persona-xbox'],
  ...CHORD_NOTCH_TARGETS.map((target): [string, ChordNotchTargetId] => [target.label, target.id])
];
const CHORD_KEYBOARD_KEY_OPTIONS: Array<[string, string]> = [
  ['Esc', 'Esc'],
  ['Enter', 'Enter'],
  ['Space', 'Space'],
  ['Tab', 'Tab'],
  ['Backspace', 'Backspace'],
  ['Delete', 'Delete'],
  ['Insert', 'Insert'],
  ['Home', 'Home'],
  ['End', 'End'],
  ['Page Up', 'Page Up'],
  ['Page Down', 'Page Down'],
  ['Up Arrow', 'Up'],
  ['Down Arrow', 'Down'],
  ['Left Arrow', 'Left'],
  ['Right Arrow', 'Right'],
  ['Print Screen', 'Print Screen'],
  ['Pause', 'Pause'],
  ['Caps Lock', 'Caps Lock'],
  ['Num Lock', 'Num Lock'],
  ['Scroll Lock', 'Scroll Lock'],
  ['Menu', 'Menu'],
  ...Array.from({ length: 24 }, (_, index): [string, string] => [`F${index + 1}`, `F${index + 1}`]),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter): [string, string] => [letter, letter]),
  ...'1234567890'.split('').map((digit): [string, string] => [digit, digit]),
  ...'0123456789'.split('').map((digit): [string, string] => [`Numpad ${digit}`, `Numpad${digit}`])
];
const CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH = Math.max(
  ...CHORD_KEYBOARD_KEY_OPTIONS.map(([label]) => label.length)
);
const CHORD_KEYBOARD_MODIFIER_OPTIONS: Array<[ChordKeyboardModifier, ChordKeyboardModifier]> = [
  ['Ctrl', 'Ctrl'],
  ['Shift', 'Shift'],
  ['Alt', 'Alt'],
  ['Win', 'Win']
];
const DEFAULT_CHORD_KEYBOARD_KEYS = ['Ctrl', 'Shift', 'Esc'];
const EMPTY_CHORD_FUNCTION_DRAFT: ChordFunctionDraft = {
  id: '',
  name: 'Task Manager',
  type: 'keyboard',
  keyboardKey: 'Esc',
  keyboardModifiers: ['Ctrl', 'Shift'],
  mediaAction: 'play-pause',
  controllerAction: 'sleep-controller',
  controllerStepPercent: CHORD_CONTROLLER_SETTING_STEP_DEFAULT
};
const DEFAULT_REMAP_DRAFT = Object.fromEntries(
  REMAP_ALL_BUTTON_IDS.map((id) => [id, id])
) as Record<RemapButtonId, RemapButtonId>;
const REMAP_CALLOUT_POINTS: Record<StandardRemapButtonId, Array<[number, number]>> = {
  l2: [[2.4, 3.17], [118.22, 3.17], [171.1, 93.49]],
  l1: [[2.4, 63.71], [121.9, 63.71], [153.13, 118.36]],
  create: [[2.4, 124.24], [110.86, 124.24], [134, 163], [186.65, 162.89]],
  'dpad-up': [[2.4, 184.78], [146.83, 184.78]],
  'dpad-right': [[2.4, 245.32], [126.31, 245.32], [138.09, 221.25]],
  'dpad-down': [[2.4, 305.86], [124.63, 305.86], [162.42, 241.39]],
  'dpad-left': [[2.4, 366.39], [106.55, 366.39], [189.13, 221.85]],
  l3: [[2.4, 426.93], [143.77, 426.93], [230.4, 275.47]],
  r2: [[595.34, 3.17], [481.09, 3.17], [427.95, 93.94]],
  r1: [[595.34, 63.71], [476.83, 63.71], [445.92, 117.79]],
  options: [[595.34, 124.24], [487.5, 124.24], [464.28, 162.89], [411.62, 162.89]],
  triangle: [[595.34, 184.78], [453.97, 184.78]],
  circle: [[595.34, 245.32], [486.88, 245.32], [473.71, 222.09]],
  cross: [[595.34, 305.86], [472.22, 305.86], [438.56, 248.84]],
  square: [[595.34, 366.39], [485.42, 366.39], [405.35, 223.46]],
  r3: [[595.34, 426.93], [453.97, 426.93], [369.45, 275.47]]
};
const REMAP_EDGE_CALLOUT_POINTS: Record<StandardRemapButtonId, Array<[number, number]>> = {
  l2: [[0.5, 0.5], [119.4, 0.5], [162.08, 90.82]],
  l1: [[0.5, 61.04], [118.08, 61.04], [154.08, 112.52]],
  create: [[0.5, 121.57], [108.96, 121.57], [132.1, 160.28], [183.55, 160.28]],
  'dpad-up': [[0.5, 182.11], [141.23, 182.11]],
  'dpad-right': [[0.5, 363.72], [104.65, 363.72], [188.5, 216.96]],
  'dpad-down': [[0.5, 303.19], [122.73, 303.19], [159.9, 239.79]],
  'dpad-left': [[0.5, 242.65], [124.41, 242.65], [137.98, 216.32]],
  l3: [[0.5, 424.26], [141.87, 424.26], [226.76, 271.06]],
  r2: [[593.44, 0.5], [482.26, 0.5], [439.58, 90.82]],
  r1: [[593.44, 61.04], [483.58, 61.04], [447.58, 112.52]],
  options: [[593.44, 121.57], [485.6, 121.57], [462.38, 160.22], [414.99, 160.22]],
  triangle: [[593.44, 182.11], [455.88, 182.11]],
  circle: [[593.44, 242.65], [484.98, 242.65], [470.67, 217.4]],
  cross: [[593.44, 303.19], [470.32, 303.19], [436.66, 246.17]],
  square: [[593.44, 363.72], [498.9, 363.72], [406.86, 218.55]],
  r3: [[593.44, 424.26], [452.07, 424.26], [370.93, 271.66]]
};
const REMAP_CALLOUT_Y: Record<StandardRemapButtonId, number> = {
  l2: 3.17,
  l1: 63.71,
  create: 124.24,
  'dpad-up': 184.78,
  'dpad-right': 245.32,
  'dpad-down': 305.86,
  'dpad-left': 366.39,
  l3: 426.93,
  r2: 3.17,
  r1: 63.71,
  options: 124.24,
  triangle: 184.78,
  circle: 245.32,
  cross: 305.86,
  square: 366.39,
  r3: 426.93
};
const REMAP_EDGE_CALLOUT_Y: Record<StandardRemapButtonId, number> = {
  l2: 0.5,
  l1: 61.04,
  create: 121.57,
  'dpad-up': 182.11,
  'dpad-right': 363.72,
  'dpad-down': 303.19,
  'dpad-left': 242.65,
  l3: 424.26,
  r2: 0.5,
  r1: 61.04,
  options: 121.57,
  triangle: 182.11,
  circle: 242.65,
  cross: 303.19,
  square: 363.72,
  r3: 424.26
};
const REMAP_STANDARD_LAYOUT_ASSET = {
  src: remappingLayoutImage,
  viewBoxWidth: 597.47,
  viewBoxHeight: 429.39,
  calloutPoints: REMAP_CALLOUT_POINTS,
  calloutY: REMAP_CALLOUT_Y
};
const REMAP_EDGE_LAYOUT_ASSET = {
  src: remappingEdgeLayoutImage,
  viewBoxWidth: 593.94,
  viewBoxHeight: 424.76,
  calloutPoints: REMAP_EDGE_CALLOUT_POINTS,
  calloutY: REMAP_EDGE_CALLOUT_Y
};
const REMAP_EDGE_CONTROL_POINTS: Record<DualSenseEdgeRemapButtonId, { x: number; y: number; anchor: 'top' | 'bottom' }> = {
  lb: { x: 227.59, y: 33.19, anchor: 'bottom' },
  rb: { x: 371.02, y: 33.19, anchor: 'bottom' },
  lfn: { x: 227.5, y: 368.88, anchor: 'top' },
  rfn: { x: 370.46, y: 368.88, anchor: 'top' }
};
const REMAP_EDGE_LINE_POINTS: Record<DualSenseEdgeRemapButtonId, [[number, number], [number, number]]> = {
  lb: [[227.59, 33.19], [227.42, 105.09]],
  rb: [[371.02, 33.19], [370.84, 105.09]],
  lfn: [[227.5, 368.88], [227.68, 296.98]],
  rfn: [[370.46, 368.88], [370.64, 296.98]]
};
const CONTROL_TABS: Array<{ id: ControlTab; label: string; Icon: TablerIcon }> = [
  { id: 'game-profile', label: 'Game Profile', Icon: IconLayoutGrid },
  { id: 'overview', label: 'Overview', Icon: IconLayoutDashboard },
  { id: 'audio', label: 'Audio', Icon: IconVolume },
  { id: 'haptics', label: 'Haptics', Icon: Sparkles },
  { id: 'triggers', label: 'Triggers', Icon: IconDeviceGamepad2 },
  { id: 'trigger-profiles', label: 'Trigger Profiles', Icon: IconTargetArrow },
  { id: 'lighting', label: 'Lighting', Icon: IconBulb },
  { id: 'remapping', label: 'Button Remapping', Icon: IconDeviceGamepad3 },
  { id: 'system', label: 'System', Icon: IconCpu }
];

type SelectValue = string | number;
type SinkSelectableAudio = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
  sinkId?: string;
};
const LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY = 'ds5bridge.lastRemapControllerType';
const UI_THEME_PRESET_STORAGE_KEY = 'ds5bridge.uiThemePreset';
const STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY = 'ds5bridge.startupTutorialCompleted.v1';
const STARTUP_READY_HOLD_MS = 1000;

function storedRemapControllerType(): KnownControllerType {
  const saved = window.localStorage.getItem(LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY);
  return saved === 'dualsense-edge' ? 'dualsense-edge' : 'dualsense';
}

function isUiThemePreset(value: string | null): value is UiThemePreset {
  return UI_THEME_OPTIONS.some(([, preset]) => preset === value);
}

function storedUiThemePreset(): UiThemePreset {
  const saved = window.localStorage.getItem(UI_THEME_PRESET_STORAGE_KEY);
  return isUiThemePreset(saved) ? saved : DEFAULT_UI_THEME_PRESET;
}

function saveUiThemePreset(preset: UiThemePreset): void {
  window.localStorage.setItem(UI_THEME_PRESET_STORAGE_KEY, preset);
}

function storedStartupTutorialStep(): StartupTutorialStep {
  return window.localStorage.getItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY) === '1' ? 'done' : 'feature-toggle';
}

function saveStartupTutorialCompleted(): void {
  window.localStorage.setItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY, '1');
}

type CustomSelectProps<T extends SelectValue> = {
  value: T;
  options: Array<[string, T]>;
  disabled?: boolean;
  className?: string;
  floatingMenu?: boolean;
  floatingMenuMinWidth?: number;
  suspendOutsideClose?: boolean;
  showSelectedCheck?: boolean;
  closeOnSelect?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  getOptionClassName?: (label: string, value: T) => string | undefined;
  renderValue?: (label: string, value: T) => ReactNode;
  renderOption?: (label: string, value: T) => ReactNode;
  renderMenuFooter?: (closeMenu: () => void) => ReactNode;
  ariaLabel: string;
  onChange: (value: T) => void;
};

type CustomSelectMenuStyle = CSSProperties & {
  '--custom-select-menu-max-height'?: string;
};

function snapHapticsValue(value: number, max = STANDARD_FEEDBACK_GAIN_PERCENT): number {
  return Math.max(0, Math.min(max, Math.round(value / HAPTICS_STEP) * HAPTICS_STEP));
}

function audioHapticsAppSource(source: AudioReactiveHapticsSource | null | undefined) {
  return source && typeof source === 'object' && source.kind === 'app-session' ? source : null;
}

function audioHapticsSessionKey(session: AudioHapticsSession): string {
  if (session.processPath) {
    return `app-path:${session.processPath.toLowerCase()}`;
  }
  if (session.executableName) {
    return `app-exe:${session.executableName.toLowerCase()}`;
  }
  return `app-pid:${session.processId}`;
}

function audioHapticsSourceKey(source: AudioReactiveHapticsSource | null | undefined): string {
  const appSource = audioHapticsAppSource(source);
  if (!appSource) {
    return 'system-audio';
  }
  if (appSource.processPath) {
    return `app-path:${appSource.processPath.toLowerCase()}`;
  }
  if (appSource.executableName) {
    return `app-exe:${appSource.executableName.toLowerCase()}`;
  }
  return `app-pid:${Math.max(0, Math.round(appSource.processId))}`;
}

function audioHapticsSourceFromSession(session: AudioHapticsSession): AudioReactiveHapticsSource {
  return {
    kind: 'app-session',
    processId: session.processId,
    displayName: session.displayName,
    ...(session.executableName ? { executableName: session.executableName } : {}),
    ...(session.processPath ? { processPath: session.processPath } : {}),
    ...(session.sessionIdentifier ? { sessionIdentifier: session.sessionIdentifier } : {}),
    ...(session.sessionInstanceIdentifier ? { sessionInstanceIdentifier: session.sessionInstanceIdentifier } : {})
  };
}

function audioHapticsSourceDisplayName(source: AudioReactiveHapticsSource | null | undefined): string {
  const appSource = audioHapticsAppSource(source);
  if (!appSource) {
    return 'System';
  }
  return appSource.displayName
    || appSource.executableName?.replace(/\.[^.]+$/, '')
    || 'Selected app';
}

function snapSpeakerVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / SPEAKER_VOLUME_STEP) * SPEAKER_VOLUME_STEP));
}

function snapMicVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / MIC_VOLUME_STEP) * MIC_VOLUME_STEP));
}

function clampAudioBufferLength(value: number): number {
  if (!Number.isFinite(value)) {
    return 64;
  }
  return Math.max(AUDIO_BUFFER_LENGTH_MIN, Math.min(AUDIO_BUFFER_LENGTH_MAX, Math.round(value)));
}

function audioBufferDelayMs(value: number): number {
  return clampAudioBufferLength(value) / 3;
}

function audioBufferDelayLabel(value: number): string {
  return `${audioBufferDelayMs(value).toFixed(1)} ms`;
}

function audioBufferPercent(value: number): number {
  return ((clampAudioBufferLength(value) - AUDIO_BUFFER_LENGTH_MIN) / (AUDIO_BUFFER_LENGTH_MAX - AUDIO_BUFFER_LENGTH_MIN)) * 100;
}

function audioBufferZoneLabel(value: number): string {
  const bufferLength = clampAudioBufferLength(value);
  if (bufferLength <= AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX) {
    return 'High stutter';
  }
  if (bufferLength <= AUDIO_BUFFER_LENGTH_RISKY_MAX) {
    return 'Risky';
  }
  return 'Safe';
}

function audioBufferZoneTooltip(value: number): string {
  const bufferLength = clampAudioBufferLength(value);
  if (bufferLength <= AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX) {
    return 'Danger: lowest haptic delay, but speaker audio is likely to stutter or underrun.';
  }
  if (bufferLength <= AUDIO_BUFFER_LENGTH_RISKY_MAX) {
    return 'Warning: lower haptic delay, with a minimal chance of speaker stutter under load.';
  }
  return 'Safe: more speaker buffer headroom, with higher DualSense haptic delay.';
}

function audioBufferZoneTone(value: number): 'stutter' | 'risky' | 'safe' {
  const bufferLength = clampAudioBufferLength(value);
  if (bufferLength <= AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX) {
    return 'stutter';
  }
  if (bufferLength <= AUDIO_BUFFER_LENGTH_RISKY_MAX) {
    return 'risky';
  }
  return 'safe';
}

function snapLightbarBrightness(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / LIGHTBAR_BRIGHTNESS_STEP) * LIGHTBAR_BRIGHTNESS_STEP));
}

function snapTriggerEffectIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / TRIGGER_EFFECT_STEP) * TRIGGER_EFFECT_STEP));
}

export function parseProcessNamesInput(input: string): string[] {
  return input
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function mergeDetectedProcessName(processNamesInput: string, candidateName: string): string {
  const existing = parseProcessNamesInput(processNamesInput);
  const name = candidateName.trim().toLowerCase();
  if (!name || existing.includes(name)) {
    return existing.join(', ');
  }
  return [...existing, name].join(', ');
}

export function formatEngineStatusLine(status: EngineStatus, activeProfileName: string): string {
  const name = status.activeStateName
    ? `${activeProfileName} — ${status.activeStateName}`
    : activeProfileName;
  if (status.suspended) return `Active: ${name} (suspended)`;
  if (status.matchedBy === 'pin') return `Active: ${name} (pinned)`;
  if (status.matchedBy === 'process') return `Active: ${name} (matched: ${status.matchedName})`;
  return `Active: ${name} (default)`;
}

/**
 * Game Profile tiles without cover art get a generated look: a deterministic gradient
 * class picked from the profile id plus a monogram built from the game title.
 */
export const GAME_TILE_ART_CLASS_COUNT = 6;

export function gameTileArtClass(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return `game-tile-art-${hash % GAME_TILE_ART_CLASS_COUNT}`;
}

export function gameTileMonogram(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0);
  const letters = words.slice(0, 2).map((word) => word[0].toUpperCase()).join('');
  return letters || '?';
}

/** The display title of a game tile: the profile's game metadata, else its name. */
export function gameProfileTitle(profile: Pick<TriggerProfile, 'name' | 'meta'>): string {
  return profile.meta?.game?.trim() || profile.name;
}

export function triggerProfileHasEffects(profile: TriggerProfile): boolean {
  return (['l2', 'r2'] as const).some((slot) => (
    profile.triggers[slot].base !== null || profile.triggers[slot].modifiers.length > 0
  ));
}

function emptyTriggerSlotPair(): TriggerSlotPair {
  return {
    l2: { base: null, modifiers: [] },
    r2: { base: null, modifiers: [] }
  };
}

/** The slot pair the editor is currently working on: the selected state's, or the profile's own. */
export function editingStateTriggers(profile: TriggerProfile, stateIndex: number): TriggerSlotPair {
  if (profile.states && profile.states.length > 0) {
    return profile.states[Math.min(stateIndex, profile.states.length - 1)].triggers;
  }
  return profile.triggers;
}

export function uniqueStateName(base: string, taken: readonly string[]): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

/**
 * Normalizes a drafted multi-state profile for save: state names are trimmed,
 * empty names become "State N", duplicates get a numeric suffix, switching
 * rules and defaultState are re-pointed at the normalized names, and the
 * profile-level triggers mirror states[0] so pre-states consumers keep seeing
 * the profile's default feel.
 */
export function sanitizeDraftStates(profile: TriggerProfile): TriggerProfile {
  if (!profile.states || profile.states.length === 0) {
    const { states: _states, switching: _switching, ...rest } = profile;
    return rest;
  }
  const renames = new Map<string, string>();
  const names: string[] = [];
  const states: TriggerStateDef[] = profile.states.map((state, index) => {
    const trimmed = state.name.trim().slice(0, MAX_STATE_NAME_LENGTH);
    const fallback = trimmed.length > 0 ? trimmed : `State ${index + 1}`;
    const name = uniqueStateName(fallback, names);
    names.push(name);
    if (state.name !== name) renames.set(state.name, name);
    return { ...state, name };
  });
  let switching = profile.switching;
  if (switching) {
    const stateNames = new Set(names);
    const rules = switching.rules
      .map((rule) => {
        if (rule.action !== 'select') return rule;
        const target = renames.get(rule.state ?? '') ?? rule.state;
        return { ...rule, state: target };
      })
      .filter((rule) => rule.action !== 'select' || (rule.state !== undefined && stateNames.has(rule.state)));
    const defaultState = renames.get(switching.defaultState ?? '') ?? switching.defaultState;
    switching = {
      ...switching,
      rules,
      ...(defaultState !== undefined && stateNames.has(defaultState)
        ? { defaultState }
        : {})
    };
    if (defaultState !== undefined && !stateNames.has(defaultState)) {
      delete switching.defaultState;
    }
  }
  return { ...profile, states, ...(switching ? { switching } : {}), triggers: states[0].triggers };
}

/**
 * Profile dropdown options with game-owned entries hidden: game settings profiles are
 * managed from the Game Profile tab, not the generic pickers. The one exception is the
 * currently selected profile — hiding it would leave the select displaying nothing while
 * a game's settings are active — which stays visible with a "— Game" suffix.
 */
export function visibleProfileOptions(
  profiles: ReadonlyArray<{ id: string; name: string }>,
  selectedId: string
): Array<[string, string]> {
  const options: Array<[string, string]> = [];
  for (const profile of profiles) {
    if (isGameSettingsProfileId(profile.id)) {
      if (profile.id !== selectedId) continue;
      options.push([`${profile.name} — Game`, profile.id]);
    } else {
      options.push([profile.name, profile.id]);
    }
  }
  return options;
}

function defaultTriggerEffectSpec(): TriggerEffectSpec {
  return defaultEffectForMode('feedback');
}

function defaultTriggerModifier(): TriggerModifier {
  return {
    when: { source: 'input', condition: 'trigger-held-over', threshold: 50, ms: 200 },
    effect: defaultTriggerEffectSpec()
  };
}

const PROVISIONAL_TRIGGER_PROFILE_ID_PREFIX = 'draft-';

function makeProvisionalTriggerProfileId(): string {
  return `${PROVISIONAL_TRIGGER_PROFILE_ID_PREFIX}${Date.now().toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`;
}

export function isProvisionalTriggerProfileId(id: string): boolean {
  return id.startsWith(PROVISIONAL_TRIGGER_PROFILE_ID_PREFIX);
}

export function mergeTriggerProfiles(
  localProfiles: readonly TriggerProfile[],
  backendProfiles: readonly TriggerProfile[],
  excludeIds: readonly string[] = []
): TriggerProfile[] {
  const backendIds = new Set(backendProfiles.map((profile) => profile.id));
  const excluded = new Set(excludeIds);
  const unsavedDrafts = localProfiles.filter(
    (profile) => !backendIds.has(profile.id) && !excluded.has(profile.id)
  );
  return [...backendProfiles, ...unsavedDrafts];
}

export function mirrorTriggerSlotBase(
  triggers: TriggerProfile['triggers'],
  sourceSlot: TriggerProfileSlotKey
): TriggerProfile['triggers'] {
  const otherSlot: TriggerProfileSlotKey = sourceSlot === 'l2' ? 'r2' : 'l2';
  const sourceBase = triggers[sourceSlot].base;
  return {
    ...triggers,
    [otherSlot]: {
      ...triggers[otherSlot],
      base: sourceBase ? { ...sourceBase } : null
    }
  };
}

export function filterTriggerProfiles(
  profiles: readonly TriggerProfile[],
  query: string
): TriggerProfile[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...profiles];
  return profiles.filter((profile) => (
    profile.name.toLowerCase().includes(needle)
    || profile.match.processNames.some((name) => name.toLowerCase().includes(needle))
  ));
}

/**
 * Filter select options by a case-insensitive substring match against the
 * option label. A blank query returns a copy of every option unchanged.
 */
export function filterSelectOptionsByLabel<T>(
  options: ReadonlyArray<[string, T]>,
  query: string
): Array<[string, T]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...options];
  return options.filter(([label]) => label.toLowerCase().includes(needle));
}

export type TriggerStripChipSelection = {
  chips: TriggerProfile[];
  overflow: TriggerProfile[];
};

/**
 * Decide which trigger profiles are shown as inline chips versus moved into the
 * overflow dropdown. The Default profile is always the first chip. The next
 * chips are the currently selected non-default profile (if any), then the
 * remaining non-default profiles by most-recently-updated (updatedAtMs), up to
 * maxChips total. Everything else becomes overflow, preserving the incoming
 * order. With maxChips 0 every profile (including Default) collapses into the
 * dropdown so the strip fits arbitrarily narrow windows.
 */
export function pickTriggerStripChips(
  profiles: readonly TriggerProfile[],
  selectedId: string | null,
  maxChips = 2
): TriggerStripChipSelection {
  const defaultProfile = profiles.find((profile) => profile.id === 'default') ?? null;
  const ranked = profiles
    .filter((profile) => profile.id !== 'default')
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  if (selectedId && selectedId !== 'default') {
    const index = ranked.findIndex((profile) => profile.id === selectedId);
    if (index > 0) {
      const [selected] = ranked.splice(index, 1);
      ranked.unshift(selected);
    }
  }

  const chipIds = new Set<string>();
  const chips: TriggerProfile[] = [];
  if (maxChips > 0 && defaultProfile) {
    chips.push(defaultProfile);
    chipIds.add(defaultProfile.id);
  }
  for (const profile of ranked) {
    if (chips.length >= maxChips) break;
    chips.push(profile);
    chipIds.add(profile.id);
  }

  const overflow = profiles.filter((profile) => !chipIds.has(profile.id));
  return { chips, overflow };
}

/**
 * Chips that fit in the space left over after the strip's action buttons
 * (measured live, passed in as availableWidth = strip minus actions). Reserves
 * room for the overflow dropdown + gaps (~150px), then budgets ~120px per chip.
 */
export function triggerStripMaxChips(availableWidth: number): number {
  const reserved = 150;
  const perChip = 120;
  return Math.max(0, Math.floor((availableWidth - reserved) / perChip));
}

function controllerPowerSavingActiveFromSnapshot(snapshot: BridgeSnapshot | null | undefined): boolean {
  return Boolean(snapshot?.settings.controllerPowerSavingEnabled && snapshot.diagnostics.audioStatus?.headsetPlugged);
}

function capControllerPowerSavingValue(value: number, snapshot: BridgeSnapshot | null | undefined): number {
  return controllerPowerSavingActiveFromSnapshot(snapshot)
    ? Math.min(value, CONTROLLER_POWER_SAVING_CAP_PERCENT)
    : value;
}

function feedbackSliderMaxFromSnapshot(snapshot: BridgeSnapshot | null | undefined): number {
  if (controllerPowerSavingActiveFromSnapshot(snapshot)) {
    return CONTROLLER_POWER_SAVING_CAP_PERCENT;
  }
  return snapshot?.settings.feedbackBoostEnabled ? BOOSTED_FEEDBACK_GAIN_PERCENT : STANDARD_FEEDBACK_GAIN_PERCENT;
}

function feedbackSliderTicks(max: number): number[] {
  if (max === STANDARD_FEEDBACK_GAIN_PERCENT) {
    return STANDARD_HAPTICS_SLIDER_TICKS;
  }
  return Array.from({ length: 11 }, (_, index) => (max / 10) * index);
}

function displayHapticsValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.hapticsGainPercent, snapshot);
}

function displayClassicRumbleValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.classicRumbleGainPercent, snapshot);
}

function displayLightbarBrightnessValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.lightbarBrightnessPercent, snapshot);
}

function displayTriggerEffectIntensityValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.triggerEffectIntensityPercent, snapshot);
}

function sliderTickClass(value: number, max: number): string | undefined {
  if (value === 0 || value === max) {
    return 'milestone endpoint';
  }
  if (value === max / 2) {
    return 'milestone';
  }
  return undefined;
}

function StartupScreen({ ready }: { ready: boolean }) {
  return (
    <main className={`startup-screen ${ready ? 'ready' : ''}`} aria-live="polite">
      <section className="startup-card" aria-label="Starting OpenDS5">
        <div className="startup-brand">
          <div>
            <strong>OpenDS5</strong>
            <span>Starting companion</span>
          </div>
        </div>
        <div className="startup-progress" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}

function StartupTutorial({
  featureExampleActive,
  onFeatureExampleToggle,
  onFinish
}: {
  featureExampleActive: boolean;
  onFeatureExampleToggle: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="modal-backdrop startup-tutorial-backdrop" role="presentation">
      <section
        className="settings-menu bridge-settings-modal startup-tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Feature tile tutorial"
      >
        <div className="settings-menu-heading bridge-settings-modal-heading">
          <div className="modal-heading-copy">
            <IconSparkleHighlight size={16} />
            <span>Feature Tiles</span>
          </div>
        </div>
        <div className="startup-tutorial-copy">
          <h2>Click The Square</h2>
          <p>Feature tiles turn effects on and off. Try it once here, then keep going.</p>
        </div>
        <div className="startup-tutorial-feature-demo">
          <button
            className={`startup-tutorial-feature-icon ${featureExampleActive ? 'active' : ''}`}
            type="button"
            aria-pressed={featureExampleActive}
            aria-label="Toggle example effect"
            onClick={onFeatureExampleToggle}
          >
            <IconSparkleHighlight size={24} />
          </button>
          <span>
            <strong>Example Effect</strong>
            <span>{featureExampleActive ? 'On' : 'Off'}</span>
          </span>
        </div>
        <div className="startup-tutorial-actions">
          <button
            type="button"
            className="primary-action"
            disabled={!featureExampleActive}
            onClick={onFinish}
          >
            Continue <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

function ProfileSaveStatus() {
  return (
    <div className="system-profile-save-status">
      <span className="autosave-check-icon" aria-hidden="true">
        <Check className="autosave-check-outline" size={16} />
        <Check className="autosave-check-fill" size={16} />
      </span>
      <span>Changes Are Automatically Saved</span>
    </div>
  );
}

function FeatureTipsPanel({
  tab,
  onSettingsFocusRequest,
  audioHapticsOpen = false
}: FeatureTipsPanelProps) {
  const [featureTileSampleActive, setFeatureTileSampleActive] = useState(false);
  const tips: Array<{
    key: string;
    icon: ReactNode;
    title: string;
    text: string;
    tone?: 'success';
  }> = [
    {
      key: 'toggle',
      icon: <IconSparkleHighlight size={16} />,
      title: 'Feature Tiles',
      text: 'Click the square icon tile to enable or disable that feature.'
    },
    {
      key: 'unavailable',
      icon: <Settings2 size={16} />,
      title: 'Unavailable',
      text: 'Dimmed controls need the bridge, controller, or matching feature enabled.'
    }
  ];

  if (tab === 'haptics' && audioHapticsOpen) {
    tips.push({
      key: 'audio-haptics',
      icon: <IconDeviceAudioTape size={16} />,
      title: 'Audio Haptics',
      text: 'Audio Haptics turns system audio into haptic feedback.'
    });
  } else if (tab === 'audio') {
    tips.push({
      key: 'headphones',
      icon: <Headphones size={16} />,
      title: 'Headphones',
      text: 'Headphones use the same bridge-local audio path as the controller speaker.'
    });
  } else {
    tips.push({
      key: 'power-saving',
      icon: <IconBatteryEco size={16} />,
      title: 'Green Icon',
      text: 'Power saving is temporarily capping this setting while headphones are connected.',
      tone: 'success'
    });
  }

  if (tab === 'haptics' && audioHapticsOpen) {
    tips.push({
      key: 'audio-haptics-mode',
      icon: <IconBrandDeezer size={16} />,
      title: 'Mix / Replace',
      text: 'Mix adds audio feedback to native haptics and rumble; Replace uses only the derived audio feel.'
    });
  } else if (tab === 'lighting') {
    tips.push({
      key: 'custom-color',
      icon: <Palette size={16} />,
      title: 'Custom Color',
      text: 'Double-click the final color swatch to choose a custom lightbar color.'
    });
  } else if (tab !== 'triggers') {
    // The triggers tab has no tests any more -- it is enable/disable plus intensity.
    tips.push({
      key: 'tests',
      icon: <Play size={16} />,
      title: 'Tests',
      text: 'Tests may pause while a game or audio stream is actively using the controller.'
    });
  }

  return (
    <section className="feature-help-panel" aria-label={`${tab} tips`}>
      <div className="feature-help-heading">
        <IconQuestionMark size={16} />
        <h3>Tips</h3>
      </div>
      <div className="feature-help-grid">
        {tips.map((tip) => (
          <div
            className="feature-help-item"
            key={tip.key}
          >
            {tip.key === 'toggle' ? (
              <button
                className={`feature-help-icon feature-help-icon-button ${featureTileSampleActive ? 'active' : ''}`}
                type="button"
                aria-pressed={featureTileSampleActive}
                aria-label="Toggle feature tile example"
                onClick={() => setFeatureTileSampleActive((active) => !active)}
              >
                {tip.icon}
              </button>
            ) : tip.key === 'power-saving' ? (
              <button
                className={`feature-help-icon feature-help-icon-button ${tip.tone ?? ''}`}
                type="button"
                aria-label="Open Controller Power Saving settings"
                onClick={() => onSettingsFocusRequest?.('controller-power-saving')}
              >
                {tip.icon}
              </button>
            ) : (
              <span className={`feature-help-icon ${tip.tone ?? ''}`} aria-hidden="true">
                {tip.icon}
              </span>
            )}
            <span className="feature-help-copy">
              <strong>{tip.title}</strong>
              <span>{tip.text}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function controllerProfileSettingsFromSnapshot(snapshot: BridgeSnapshot): ControllerProfileSettings {
  return {
    hapticsEnabled: snapshot.settings.hapticsEnabled,
    hapticsGainPercent: snapshot.settings.hapticsGainPercent,
    feedbackBoostEnabled: snapshot.settings.feedbackBoostEnabled,
    classicRumbleEnabled: snapshot.settings.classicRumbleEnabled,
    classicRumbleGainPercent: snapshot.settings.classicRumbleGainPercent,
    classicRumbleV1Enabled: snapshot.settings.classicRumbleV1Enabled,
    adaptiveTriggersEnabled: snapshot.settings.adaptiveTriggersEnabled,
    triggerEffectIntensityPercent: snapshot.settings.triggerEffectIntensityPercent,
    triggerTestMode: snapshot.settings.triggerTestMode,
    speakerEnabled: snapshot.settings.speakerEnabled,
    speakerVolumePercent: snapshot.settings.speakerVolumePercent,
    micVolumePercent: snapshot.settings.micVolumePercent,
    micMuted: snapshot.settings.micMuted,
    lightbarEnabled: snapshot.settings.lightbarEnabled,
    lightbarColor: snapshot.settings.lightbarColor,
    lightbarBrightnessPercent: snapshot.settings.lightbarBrightnessPercent,
    lightbarOverrideEnabled: snapshot.settings.lightbarOverrideEnabled,
    muteButtonMode: snapshot.settings.muteButtonMode,
    muteKeyboardUsage: snapshot.settings.muteKeyboardUsage,
    muteKeyboardModifiers: snapshot.settings.muteKeyboardModifiers,
    muteKeyboardBehavior: snapshot.settings.muteKeyboardBehavior,
    muteKeyboardChordStarterEnabled: snapshot.settings.muteKeyboardChordStarterEnabled,
    sleepKeybindEnabled: snapshot.settings.sleepKeybindEnabled,
    speakerVolumeShortcutEnabled: snapshot.settings.speakerVolumeShortcutEnabled,
    pollingRateMode: snapshot.settings.pollingRateMode,
    hostPersonaMode: snapshot.settings.hostPersonaMode,
    duplexMicEnabled: snapshot.settings.duplexMicEnabled,
    audioReactiveHapticsEnabled: snapshot.settings.audioReactiveHapticsEnabled,
    audioReactiveHapticsSource: snapshot.settings.audioReactiveHapticsSource,
    audioReactiveHapticsMode: snapshot.settings.audioReactiveHapticsMode,
    audioReactiveHapticsGainPercent: snapshot.settings.audioReactiveHapticsGainPercent,
    audioReactiveHapticsBassFocus: snapshot.settings.audioReactiveHapticsBassFocus,
    audioReactiveHapticsResponse: snapshot.settings.audioReactiveHapticsResponse,
    audioReactiveHapticsAttack: snapshot.settings.audioReactiveHapticsAttack,
    audioReactiveHapticsRelease: snapshot.settings.audioReactiveHapticsRelease,
    controllerPowerSavingEnabled: snapshot.settings.controllerPowerSavingEnabled
  };
}

function optionLabel<T extends string | number>(options: Array<[string, T]>, value: T): string {
  return options.find(([, optionValue]) => optionValue === value)?.[0] ?? String(value);
}

function enabledLabel(enabled: boolean): string {
  return enabled ? 'On' : 'Off';
}

function percentLabel(value: number): string {
  return `${value}%`;
}

function lightbarColorLabel(color: string): string {
  return LIGHTBAR_COLOR_NAMES[color.toLowerCase()] ?? color.toUpperCase();
}

function muteButtonSummary(settings: ControllerProfileSettings): string {
  if (settings.muteButtonMode === 'normal') {
    return 'Normal';
  }
  if (settings.muteButtonMode === 'quiet') {
    return 'Quiet Toggle';
  }
  const key = optionLabel(MUTE_KEY_OPTIONS, settings.muteKeyboardUsage);
  const modifiers = MUTE_MODIFIER_OPTIONS
    .filter(([, bit]) => (settings.muteKeyboardModifiers & bit) !== 0)
    .map(([label]) => label);
  const chordStarter = settings.muteButtonMode === 'keyboard' && settings.muteKeyboardChordStarterEnabled
    ? ['Chord Starter']
    : [];
  return [...modifiers, key, ...chordStarter].join(' + ');
}

function SystemProfileSummary({
  settings,
  powerSavingActive
}: {
  settings: ControllerProfileSettings;
  powerSavingActive: boolean;
}) {
  const ecoValueClass = (active: boolean) => (active ? ' eco-limited' : '');
  const effectiveEcoPercent = (value: number) => percentLabel(Math.min(value, CONTROLLER_POWER_SAVING_CAP_PERCENT));
  const hapticsEcoLimited = powerSavingActive
    && settings.hapticsEnabled
    && settings.hapticsGainPercent > 0;
  const rumbleEcoLimited = powerSavingActive
    && settings.classicRumbleEnabled
    && settings.classicRumbleGainPercent > 0;
  const triggersEcoLimited = powerSavingActive
    && settings.adaptiveTriggersEnabled
    && settings.triggerEffectIntensityPercent > 0;
  const lightbarEcoLimited = powerSavingActive
    && settings.lightbarEnabled
    && settings.lightbarBrightnessPercent > 0;

  return (
    <div className="system-profile-summary" aria-label="Current profile settings">
      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <Volume2 size={15} />
          <h3>Audio</h3>
        </div>
        <dl>
          <div><dt>Speaker</dt><dd>{settings.speakerEnabled ? percentLabel(settings.speakerVolumePercent) : 'Off'}</dd></div>
          <div><dt>Mic</dt><dd>{settings.micMuted ? 'Muted' : percentLabel(settings.micVolumePercent)}</dd></div>
          <div><dt>Pass-through</dt><dd>{enabledLabel(settings.duplexMicEnabled)}</dd></div>
        </dl>
      </div>

      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <Sparkles size={15} />
          <h3>Feel</h3>
        </div>
        <dl>
          <div><dt>HD Haptics</dt><dd className={ecoValueClass(hapticsEcoLimited)}>{settings.hapticsEnabled ? (hapticsEcoLimited ? effectiveEcoPercent(settings.hapticsGainPercent) : percentLabel(settings.hapticsGainPercent)) : 'Off'}</dd></div>
          <div><dt>Rumble</dt><dd className={ecoValueClass(rumbleEcoLimited)}>{settings.classicRumbleEnabled ? (rumbleEcoLimited ? effectiveEcoPercent(settings.classicRumbleGainPercent) : percentLabel(settings.classicRumbleGainPercent)) : 'Off'}</dd></div>
          <div><dt>Triggers</dt><dd className={ecoValueClass(triggersEcoLimited)}>{settings.adaptiveTriggersEnabled ? (triggersEcoLimited ? effectiveEcoPercent(settings.triggerEffectIntensityPercent) : percentLabel(settings.triggerEffectIntensityPercent)) : 'Off'}</dd></div>
        </dl>
      </div>

      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <IconBulb size={15} />
          <h3>Lighting</h3>
        </div>
        <dl>
          <div><dt>Lightbar</dt><dd className={ecoValueClass(lightbarEcoLimited)}>{settings.lightbarEnabled ? (lightbarEcoLimited ? effectiveEcoPercent(settings.lightbarBrightnessPercent) : percentLabel(settings.lightbarBrightnessPercent)) : 'Off'}</dd></div>
          <div><dt>Color</dt><dd>{lightbarColorLabel(settings.lightbarColor)}</dd></div>
          <div><dt>Override</dt><dd>{enabledLabel(settings.lightbarOverrideEnabled)}</dd></div>
        </dl>
      </div>

      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <Settings2 size={15} />
          <h3>System</h3>
        </div>
        <dl>
          <div><dt>Mute</dt><dd>{muteButtonSummary(settings)}</dd></div>
          <div><dt>Polling</dt><dd>{optionLabel(POLLING_RATE_OPTIONS, settings.pollingRateMode)}</dd></div>
          <div><dt>Power Save</dt><dd>{enabledLabel(settings.controllerPowerSavingEnabled)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

function normalizeHexColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#ffff00';
}

function normalizeLightbarPresetColor(value: string): string {
  return normalizeHexColor(value);
}

function isLightbarPresetColor(value: string): boolean {
  return LIGHTBAR_SWATCHES.includes(normalizeLightbarPresetColor(value));
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => clampByte(channel).toString(16).padStart(2, '0')).join('')}`;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedHue = (((hue % 360) + 360) % 360) / 360;
  const normalizedSaturation = Math.max(0, Math.min(100, saturation)) / 100;
  const normalizedLightness = Math.max(0, Math.min(100, lightness)) / 100;

  if (normalizedSaturation === 0) {
    const channel = clampByte(normalizedLightness * 255);
    return rgbToHex(channel, channel, channel);
  }

  const q = normalizedLightness < 0.5
    ? normalizedLightness * (1 + normalizedSaturation)
    : normalizedLightness + normalizedSaturation - normalizedLightness * normalizedSaturation;
  const p = 2 * normalizedLightness - q;
  const hueToRgb = (offset: number) => {
    let t = normalizedHue + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return rgbToHex(hueToRgb(1 / 3) * 255, hueToRgb(0) * 255, hueToRgb(-1 / 3) * 255);
}

function makeLightbarCustomPalette(): LightbarPaletteCell[][] {
  const hues = [
    { hue: 0, name: 'Red' },
    { hue: 30, name: 'Orange' },
    { hue: 60, name: 'Yellow' },
    { hue: 90, name: 'Lime' },
    { hue: 120, name: 'Green' },
    { hue: 150, name: 'Mint' },
    { hue: 180, name: 'Cyan' },
    { hue: 210, name: 'Sky' },
    { hue: 240, name: 'Blue' },
    { hue: 270, name: 'Violet' },
    { hue: 300, name: 'Magenta' },
    { hue: 330, name: 'Rose' }
  ];
  const rows = [
    { saturation: 28, lightness: 88, tone: 'Pale', gray: '#ffffff', grayName: 'White' },
    { saturation: 58, lightness: 78, tone: 'Soft', gray: '#d9d9d9', grayName: 'Light Gray' },
    { saturation: 82, lightness: 66, tone: 'Light', gray: '#b3b3b3', grayName: 'Silver' },
    { saturation: 100, lightness: 58, tone: 'Bright', gray: '#8a8a8a', grayName: 'Gray' },
    { saturation: 100, lightness: 50, tone: 'Pure', gray: '#666666', grayName: 'Dim Gray' },
    { saturation: 100, lightness: 40, tone: 'Deep', gray: '#4a4a4a', grayName: 'Charcoal' },
    { saturation: 100, lightness: 30, tone: 'Dark', gray: '#333333', grayName: 'Dark Gray' },
    { saturation: 100, lightness: 20, tone: 'Midnight', gray: '#1a1a1a', grayName: 'Near Black' },
    { saturation: 100, lightness: 10, tone: 'Blackened', gray: '#000000', grayName: 'Black' }
  ];
  return rows.map((row) => [
    ...hues.map((hue) => ({
      color: hslToHex(hue.hue, row.saturation, row.lightness),
      name: `${row.tone} ${hue.name}`
    })),
    {
      color: row.gray,
      name: row.grayName
    }
  ]);
}

function makeLightbarColorNames(): Record<string, string> {
  const names = { ...LIGHTBAR_SWATCH_NAMES };
  for (const row of LIGHTBAR_CUSTOM_PALETTE) {
    for (const cell of row) {
      names[cell.color] ??= cell.name;
    }
  }
  names[LIGHTBAR_DEFAULT_CUSTOM_COLOR] = 'Custom';
  return names;
}

function lightbarColorFromSnapshot(snapshot: BridgeSnapshot): string {
  if (snapshot.status?.firmwareFlags.lightbarControl) {
    const color = snapshot.status.lightbarColor;
    return normalizeLightbarPresetColor(rgbToHex(color.red, color.green, color.blue));
  }
  return normalizeLightbarPresetColor(snapshot.settings.lightbarColor);
}

function lightbarBrightnessFromSnapshot(snapshot: BridgeSnapshot): number {
  if (snapshot.status?.firmwareFlags.lightbarControl) {
    return snapshot.status.lightbarColor.brightnessPercent;
  }
  return snapshot.settings.lightbarBrightnessPercent;
}

function batteryLabel(snapshot: BridgeSnapshot | null | undefined): string {
  const battery = snapshot?.status?.batteryPercent;
  return battery === null || battery === undefined ? '--' : `${battery}%`;
}

function batteryTone(percent: number | null | undefined): 'healthy' | 'warning' | 'low' | 'unknown' {
  if (percent === null || percent === undefined) return 'unknown';
  if (percent <= 20) return 'low';
  if (percent <= 45) return 'warning';
  return 'healthy';
}

function isChargingPowerState(rawPowerState: number | undefined): boolean {
  return rawPowerState === 0x01 || rawPowerState === 0x02;
}

function controllerName(type: string | undefined): string {
  if (type === 'dualsense-edge') return 'DualSense Edge';
  if (type === 'dualsense') return 'DualSense';
  return 'Controller';
}

function healthLabel(snapshot: BridgeSnapshot | null | undefined): string {
  if (!snapshot) return 'Unavailable';
  if (snapshot.state !== 'connected') {
    return /^Firmware .+ update required$/i.test(snapshot.message)
      ? 'Update required: Bridge Settings > Firmware'
      : snapshot.message;
  }
  if (snapshot.diagnostics.lastError) return snapshot.diagnostics.lastError;
  if (snapshot.diagnostics.firmwareUpdateAvailable) {
    return `Firmware ${snapshot.diagnostics.firmwareUpdateAvailable.availableVersion} available`;
  }
  return 'All systems normal';
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function normalizeAudioDeviceLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/^\s*\d+\s*-\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBridgeAudioLabel(label: string): boolean {
  return BRIDGE_AUDIO_OUTPUT_RE.test(normalizeAudioDeviceLabel(label));
}

function bridgeAudioOutputScore(device: MediaDeviceInfo): number {
  const label = normalizeAudioDeviceLabel(device.label);
  let score = 1;
  if (label.includes('dualsense') || label.includes('dual sense')) score += 4;
  if (label.includes('wireless controller')) score += 3;
  if (label.includes('speaker') || label.includes('headphone') || label.includes('headset')) score += 2;
  if (label.includes('microphone') || label.includes('mic')) score -= 4;
  if (label.includes('ds5') || label.includes('bridge')) score += 1;
  return score;
}

function bridgeAudioInputScore(device: MediaDeviceInfo): number {
  const label = normalizeAudioDeviceLabel(device.label);
  let score = 1;
  if (label.includes('dualsense') || label.includes('dual sense')) score += 4;
  if (label.includes('wireless controller')) score += 3;
  if (label.includes('microphone') || label.includes('mic')) score += 2;
  if (label.includes('speaker') || label.includes('headphone')) score -= 4;
  if (label.includes('ds5') || label.includes('bridge')) score += 1;
  return score;
}

async function findBridgeAudioOutputIdOnce(): Promise<string | null> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((device) => (
      device.kind === 'audiooutput'
      && isBridgeAudioLabel(device.label)
      && device.deviceId
      && device.deviceId !== 'default'
      && device.deviceId !== 'communications'
    ));
    outputs.sort((left, right) => bridgeAudioOutputScore(right) - bridgeAudioOutputScore(left));
    const output = outputs[0];
    return output?.deviceId ?? null;
  } catch {
    return null;
  }
}

async function findBridgeAudioInputIdOnce(): Promise<string | null> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => (
      device.kind === 'audioinput'
      && BRIDGE_AUDIO_INPUT_RE.test(normalizeAudioDeviceLabel(device.label))
      && device.deviceId
      && device.deviceId !== 'default'
      && device.deviceId !== 'communications'
    ));
    inputs.sort((left, right) => bridgeAudioInputScore(right) - bridgeAudioInputScore(left));
    const input = inputs[0];
    return input?.deviceId ?? null;
  } catch {
    return null;
  }
}

async function unlockMediaDeviceLabels(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  let permissionStream: MediaStream | null = null;
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return true;
  } catch {
    return false;
  } finally {
    permissionStream?.getTracks().forEach((track) => track.stop());
  }
}

async function findBridgeAudioInputId(): Promise<string | null> {
  let inputId = await findBridgeAudioInputIdOnce();
  if (inputId || !navigator.mediaDevices?.getUserMedia) {
    return inputId;
  }

  if (!await unlockMediaDeviceLabels()) {
    return null;
  }

  inputId = await findBridgeAudioInputIdOnce();
  return inputId;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

let speakerPrerollSilenceUrl: string | null = null;

function getSpeakerPrerollSilenceUrl(): string {
  if (speakerPrerollSilenceUrl) {
    return speakerPrerollSilenceUrl;
  }

  const sampleRate = 48000;
  const channels = 2;
  const bytesPerSample = 2;
  const frames = Math.round((sampleRate * TEST_SPEAKER_PREROLL_MS) / 1000);
  const dataSize = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  speakerPrerollSilenceUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return speakerPrerollSilenceUrl;
}

async function findBridgeAudioOutputId(attempts = 1): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const sinkId = await findBridgeAudioOutputIdOnce();
    if (sinkId) {
      return sinkId;
    }
    if (attempt + 1 < attempts) {
      await delay(TEST_SPEAKER_ENDPOINT_RETRY_MS);
    }
  }
  if (await unlockMediaDeviceLabels()) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const sinkId = await findBridgeAudioOutputIdOnce();
      if (sinkId) {
        return sinkId;
      }
      if (attempt + 1 < attempts) {
        await delay(TEST_SPEAKER_ENDPOINT_RETRY_MS);
      }
    }
  }
  return null;
}

let speakerToneAudio: SinkSelectableAudio | null = null;
let speakerToneSinkId: string | null = null;

function resetSpeakerToneAudio(): void {
  if (speakerToneAudio) {
    try {
      speakerToneAudio.pause();
      speakerToneAudio.removeAttribute('src');
      speakerToneAudio.load();
    } catch {
      // Ignore teardown races while Windows is removing the audio endpoint.
    }
  }
  speakerToneAudio = null;
  speakerToneSinkId = null;
}

async function playSpeakerAudioSource(sourceUrl: string): Promise<void> {
  const sinkId = await findBridgeAudioOutputId(TEST_SPEAKER_ENDPOINT_ATTEMPTS);
  if (!sinkId) {
    throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
  }

  // Reuse the persistent Audio element if the endpoint hasn't changed.
  // This keeps the WASAPI session alive so the firmware audio pipeline stays warm.
  if (!speakerToneAudio || speakerToneSinkId !== sinkId) {
    const audio = new Audio() as SinkSelectableAudio;
    audio.volume = 1;
    if (!audio.setSinkId) {
      throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
    }
    try {
      await audio.setSinkId(sinkId);
    } catch {
      throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
    }
    if (audio.sinkId !== undefined && audio.sinkId !== sinkId) {
      throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
    }
    speakerToneAudio = audio;
    speakerToneSinkId = sinkId;
  }

  const audio = speakerToneAudio;
  audio.src = sourceUrl;
  audio.currentTime = 0;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const mediaDevices = navigator.mediaDevices;
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const verifySink = () => {
      void (async () => {
        const currentSinkId = await findBridgeAudioOutputIdOnce();
        if (
          currentSinkId !== sinkId
          || (audio.sinkId !== undefined && audio.sinkId !== sinkId)
        ) {
          resetSpeakerToneAudio();
          fail(new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE));
        }
      })();
    };
    const verifyTimer = window.setInterval(verifySink, TEST_SPEAKER_ENDPOINT_VERIFY_MS);
    function cleanup() {
      window.clearInterval(verifyTimer);
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', onAudioError);
      mediaDevices?.removeEventListener?.('devicechange', verifySink);
    }
    function onAudioError() {
      fail(new Error('Speaker test audio playback failed.'));
    }

    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', onAudioError, { once: true });
    mediaDevices?.addEventListener?.('devicechange', verifySink);
    audio.play().then(verifySink).catch((error: unknown) => {
      fail(error instanceof Error ? error : new Error('Speaker test audio playback failed.'));
    });
  });
}

async function playSpeakerToneFile(): Promise<void> {
  await playSpeakerAudioSource(getSpeakerPrerollSilenceUrl());
  await delay(25);
  await playSpeakerAudioSource(testSpeakerToneUrl);
}

let micListenAudio: HTMLAudioElement | null = null;
let micListenStream: MediaStream | null = null;
let micListenTimer: number | null = null;
let micListenResolve: (() => void) | null = null;

function stopMicLiveListen(): void {
  if (micListenTimer !== null) {
    window.clearTimeout(micListenTimer);
  }
  micListenTimer = null;
  if (micListenAudio) {
    try {
      micListenAudio.pause();
      micListenAudio.srcObject = null;
    } catch {
      // Ignore teardown races while the mic endpoint is closing.
    }
  }
  micListenAudio = null;
  micListenStream?.getTracks().forEach((track) => track.stop());
  micListenStream = null;
  const resolve = micListenResolve;
  micListenResolve = null;
  resolve?.();
}

async function openBridgeMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(BRIDGE_MIC_ENDPOINT_UNAVAILABLE);
  }

  const inputId = await findBridgeAudioInputId();
  if (!inputId) {
    throw new Error(BRIDGE_MIC_ENDPOINT_UNAVAILABLE);
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: inputId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: false
  });
}

async function playMicLiveListen(durationMs: number): Promise<void> {
  stopMicLiveListen();
  const stream = await openBridgeMicStream();
  const audio = new Audio();
  audio.srcObject = stream;
  audio.volume = 1;
  micListenAudio = audio;
  micListenStream = stream;

  try {
    await audio.play();
  } catch (error) {
    stopMicLiveListen();
    throw error;
  }

  await new Promise<void>((resolve) => {
    micListenResolve = resolve;
    micListenTimer = window.setTimeout(stopMicLiveListen, durationMs);
  });
}

function CustomSelect<T extends SelectValue>({
  value,
  options,
  disabled = false,
  className = '',
  floatingMenu = false,
  floatingMenuMinWidth,
  suspendOutsideClose = false,
  showSelectedCheck = true,
  closeOnSelect = true,
  searchable = false,
  searchPlaceholder,
  getOptionClassName,
  renderValue,
  renderOption,
  renderMenuFooter,
  ariaLabel,
  onChange
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const selected = options.find(([, optionValue]) => optionValue === value);
  const visibleOptions = searchable ? filterSelectOptionsByLabel(options, searchQuery) : options;
  const longList = options.length > 18;
  const defaultMenuMaxHeight = longList ? 360 : 232;
  const [menuMaxHeight, setMenuMaxHeight] = useState(defaultMenuMaxHeight);
  const [menuPlacement, setMenuPlacement] = useState<'top' | 'bottom'>('bottom');
  const [floatingMenuStyle, setFloatingMenuStyle] = useState<CustomSelectMenuStyle>({});

  function updateMenuMaxHeight() {
    const root = rootRef.current;
    if (!root) {
      setMenuMaxHeight(defaultMenuMaxHeight);
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const boundary = floatingMenu
      ? null
      : root.closest('.system-card, .feature-card, .settings-menu, .control-page') as HTMLElement | null;
    const boundaryRect = boundary?.getBoundingClientRect();
    const menuGap = 6;
    const viewportPadding = floatingMenu ? 8 : 0;
    const lowerLimit = Math.min(window.innerHeight - viewportPadding, boundaryRect?.bottom ?? window.innerHeight);
    const upperLimit = Math.max(viewportPadding, boundaryRect?.top ?? 0);
    const spaceBelow = Math.max(1, Math.floor(lowerLimit - rootRect.bottom - menuGap));
    const spaceAbove = Math.max(1, Math.floor(rootRect.top - upperLimit - menuGap));
    const preferredVisibleHeight = Math.min(defaultMenuMaxHeight, 184);
    const nextPlacement = spaceBelow < preferredVisibleHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const availableSpace = nextPlacement === 'top' ? spaceAbove : spaceBelow;
    const nextMaxHeight = longList ? availableSpace : Math.min(defaultMenuMaxHeight, availableSpace);

    setMenuPlacement(nextPlacement);
    setMenuMaxHeight(Math.max(1, nextMaxHeight));

    if (floatingMenu) {
      const minimumWidth = floatingMenuMinWidth ?? rootRect.width;
      const width = Math.min(
        Math.max(rootRect.width, minimumWidth),
        Math.max(1, window.innerWidth - viewportPadding * 2)
      );
      const idealLeft = rootRect.left + (rootRect.width - width) / 2;
      const left = Math.min(
        Math.max(viewportPadding, idealLeft),
        Math.max(viewportPadding, window.innerWidth - viewportPadding - width)
      );
      setFloatingMenuStyle({
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        ...(nextPlacement === 'top'
          ? { bottom: `${Math.round(window.innerHeight - rootRect.top + menuGap)}px` }
          : { top: `${Math.round(rootRect.bottom + menuGap)}px` }),
        '--custom-select-menu-max-height': `${Math.max(1, nextMaxHeight)}px`
      });
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    function closeIfOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !suspendOutsideClose
        && !rootRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', closeIfOutside);
    return () => document.removeEventListener('mousedown', closeIfOutside);
  }, [open, suspendOutsideClose]);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuMaxHeight();
    window.addEventListener('resize', updateMenuMaxHeight);
    window.addEventListener('scroll', updateMenuMaxHeight, true);
    return () => {
      window.removeEventListener('resize', updateMenuMaxHeight);
      window.removeEventListener('scroll', updateMenuMaxHeight, true);
    };
  }, [open, defaultMenuMaxHeight, floatingMenu, floatingMenuMinWidth, longList]);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      return;
    }
    if (searchable) {
      window.requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open, searchable]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      const menu = menuRef.current;
      const optionsContainer = menu?.querySelector('.custom-select-menu-options') as HTMLElement | null;
      const selectedElement = menu?.querySelector('[data-selected="true"]') as HTMLElement | null;
      if (!optionsContainer || !selectedElement) {
        return;
      }
      const selectedCenter = selectedElement.offsetTop + selectedElement.offsetHeight / 2;
      optionsContainer.scrollTop = Math.max(0, selectedCenter - optionsContainer.clientHeight / 2);
    });
  }, [open]);

  function choose(nextValue: T) {
    if (closeOnSelect) {
      setOpen(false);
    }
    if (nextValue !== value) {
      onChange(nextValue);
    }
  }

  function toggleOpen() {
    if (!open) {
      updateMenuMaxHeight();
    }
    setOpen((nextOpen) => !nextOpen);
  }

  function openMenu() {
    updateMenuMaxHeight();
    setOpen(true);
  }

  const menu = open ? (
    <div ref={menuRef} className="custom-select-menu" role="listbox" aria-label={ariaLabel}>
      {searchable && (
        <div className="custom-select-menu-search">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            placeholder={searchPlaceholder ?? 'Search'}
            aria-label={`${ariaLabel} search`}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
              }
            }}
          />
        </div>
      )}
      <div className="custom-select-menu-options">
        {searchable && visibleOptions.length === 0 && (
          <div className="custom-select-menu-empty">No matches</div>
        )}
        {visibleOptions.map(([label, optionValue]) => {
          const selectedOption = optionValue === value;
          const optionClassName = getOptionClassName?.(label, optionValue);
          return (
            <button
              key={String(optionValue)}
              type="button"
              role="option"
              aria-selected={selectedOption}
              data-selected={selectedOption ? 'true' : undefined}
              className={[selectedOption ? 'selected' : '', optionClassName].filter(Boolean).join(' ')}
              onClick={() => choose(optionValue)}
            >
              <span>{renderOption?.(label, optionValue) ?? label}</span>
              {showSelectedCheck && selectedOption && <Check size={15} />}
            </button>
          );
        })}
      </div>
      {renderMenuFooter && (
        <div className="custom-select-menu-footer">
          {renderMenuFooter(() => setOpen(false))}
        </div>
      )}
    </div>
  ) : null;

  const portalTarget = floatingMenu
    ? (rootRef.current?.closest('.shell') as HTMLElement | null) ?? document.body
    : null;

  return (
    <div
      ref={rootRef}
      className={`custom-select ${className} ${open ? 'open' : ''} menu-${menuPlacement} ${disabled ? 'disabled' : ''}`}
      style={{ '--custom-select-menu-max-height': `${menuMaxHeight}px` } as CSSProperties}
    >
      <button
        type="button"
        className="custom-select-button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openMenu();
          }
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        <span>{selected ? (renderValue?.(selected[0], selected[1]) ?? selected[0]) : String(value)}</span>
        <ChevronDown size={18} />
      </button>
      {floatingMenu && portalTarget && menu
        ? createPortal(
          <div
            className={`custom-select custom-select-floating-layer open menu-${menuPlacement} ${suspendOutsideClose ? 'dialog-suspended' : ''} ${className}`}
            style={floatingMenuStyle}
          >
            {menu}
          </div>,
          portalTarget
        )
        : menu}
    </div>
  );
}

function ThemeOption({ label, value }: { label: string; value: UiThemePreset }) {
  return (
      <span className="theme-option">
        <span className="theme-option-swatches" aria-hidden="true">
        {UI_THEME_PREVIEW_SWATCHES[value].map((swatch) => (
          <span key={`${value}-${swatch.role}`} title={swatch.role} style={{ background: swatch.color }} />
        ))}
      </span>
      <span className="theme-option-label">{label}</span>
    </span>
  );
}

function AudioHapticsConfigLabel({
  id,
  label,
  tooltip,
  className = '',
  showQuestionMark = false
}: {
  id: string;
  label: string;
  tooltip: string;
  className?: string;
  showQuestionMark?: boolean;
}) {
  return (
    <span className={`audio-haptics-config-label ${className}`.trim()} tabIndex={0} aria-describedby={id}>
      {label}
      {showQuestionMark ? <IconQuestionMark size={12} stroke={3} aria-hidden="true" /> : null}
      <span id={id} className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-haptics-config-tooltip" role="tooltip">
        {tooltip}
      </span>
    </span>
  );
}

function UptimeValue({
  active,
  lastPollAt,
  uptimeSeconds
}: {
  active: boolean;
  lastPollAt: number | null;
  uptimeSeconds: number | null;
}) {
  const [displayUptime, setDisplayUptime] = useState<number | null>(uptimeSeconds);

  useEffect(() => {
    if (!active || !lastPollAt || uptimeSeconds === null) {
      setDisplayUptime(uptimeSeconds);
      return;
    }

    const updateUptime = () => {
      const elapsedSeconds = Math.floor((Date.now() - lastPollAt) / 1000);
      setDisplayUptime(uptimeSeconds + Math.max(0, elapsedSeconds));
    };

    updateUptime();
    const handle = window.setInterval(updateUptime, 1000);
    return () => window.clearInterval(handle);
  }, [active, lastPollAt, uptimeSeconds]);

  return <span className="uptime-value">{displayUptime ?? '--'}s</span>;
}

function RemapGlyphOption({ label, value }: { label: string; value: RemapButtonId }) {
  const button = REMAP_BUTTONS[value];

  return (
    <span className="remap-glyph-option" title={label}>
      {button.glyphUrl ? (
        <img src={button.glyphUrl} alt={label} />
      ) : (
        <span className="remap-text-glyph" aria-hidden="true">{button.textGlyph ?? button.label}</span>
      )}
    </span>
  );
}

function RemapSourceGlyph({ button }: { button: RemapButtonDefinition }) {
  return button.glyphUrl ? (
    <img src={button.glyphUrl} alt={button.label} title={button.label} />
  ) : (
    <span className="remap-text-glyph remap-text-glyph-source" title={button.label}>
      {button.textGlyph ?? button.label}
    </span>
  );
}

function ChordStarterGlyph({ starter, label = CHORD_STARTERS[starter].label }: { starter: ChordStarterId; label?: string }) {
  const button = CHORD_STARTERS[starter];
  const Icon = button.Icon;

  return Icon ? (
    <span className="chords-unassigned-glyph chords-starter-icon-glyph" title={label} aria-label={label}>
      <Icon size={18} />
    </span>
  ) : button.glyphUrl ? (
    <img src={button.glyphUrl} alt={label} title={label} />
  ) : (
    <span className="remap-text-glyph remap-text-glyph-source" title={label}>
      {button.textGlyph ?? button.label}
    </span>
  );
}

function ChordStarterGlyphOption({ label, value }: { label: string; value: ChordStarterId }) {
  return (
    <span className="chords-starter-glyph-option" title={label}>
      <ChordStarterGlyph starter={value} label={label} />
    </span>
  );
}

function ChordButtonGlyphOption({ label, value }: { label: string; value: ChordButtonSelectValue }) {
  if (value === CHORD_UNASSIGNED_BUTTON) {
    return (
      <span className="chords-unassigned-glyph" title={label} aria-label={label}>
        <IconQuestionMark size={16} />
      </span>
    );
  }

  return <RemapGlyphOption label={label} value={value} />;
}

function HostPersonaOption({ label, value }: { label: string; value: HostPersonaMode }) {
  const sonyPersona = value === 'dualsense' || value === 'ds4';
  return (
    <span className="host-persona-option">
      {sonyPersona ? (
        <span
          className="host-persona-brand-icon"
          style={{ '--host-persona-brand-mask': `url("${playStationLogoUrl}")` } as CSSProperties}
          aria-hidden="true"
        />
      ) : (
        <IconBrandXbox size={18} aria-hidden="true" />
      )}
      <span className="host-persona-label">{label}</span>
    </span>
  );
}

function AudioHapticsSourceOption({
  label,
  value,
  session,
  loading
}: {
  label: string;
  value: string;
  session?: AudioHapticsSession;
  loading?: boolean;
}) {
  const system = value === 'system-audio';
  const unavailable = !system && !session;
  let sublabel = 'System mix';
  if (!system) {
    if (!session) {
      sublabel = loading ? 'Scanning' : 'Unavailable';
    } else {
      sublabel = session.state === 'active'
        ? session.endpointName || 'Active'
        : 'Idle';
    }
  }
  return (
    <span className={`audio-haptics-source-option ${unavailable ? 'unavailable' : ''}`}>
      <span className="audio-haptics-source-icon" aria-hidden="true">
        {system ? (
          <IconDeviceAudioTape size={17} />
        ) : session?.iconDataUrl ? (
          <img src={session.iconDataUrl} alt="" />
        ) : (
          <IconBrandDeezer size={17} />
        )}
      </span>
      <span className="audio-haptics-source-copy">
        <strong>{label}</strong>
        <small>{sublabel}</small>
      </span>
    </span>
  );
}

function remapTargetOptionsFor(buttonId: RemapButtonId): Array<[string, RemapButtonId]> {
  if ((REMAP_EDGE_BUTTON_IDS as readonly RemapButtonId[]).includes(buttonId)) {
    return [...REMAP_TARGET_OPTIONS, [REMAP_BUTTONS[buttonId].label, buttonId]];
  }
  return REMAP_TARGET_OPTIONS;
}

function chordFunctionTypeLabel(type: ChordFunctionType): string {
  return CHORD_FUNCTION_TYPE_OPTIONS.find(([, value]) => value === type)?.[0] ?? 'Function';
}

function chordMediaActionLabel(action: ChordMediaAction): string {
  return CHORD_MEDIA_ACTION_OPTIONS.find(([, value]) => value === action)?.[0] ?? 'Media Action';
}

function chordNotchTargetForAction(action: ChordControllerSettingAction): {
  target: (typeof CHORD_NOTCH_TARGETS)[number];
  direction: ChordNotchDirection;
} | null {
  for (const target of CHORD_NOTCH_TARGETS) {
    if (target.downAction === action) {
      return { target, direction: 'down' };
    }
    if (target.upAction === action) {
      return { target, direction: 'up' };
    }
  }
  return null;
}

function chordControllerSettingSelectValue(action: ChordControllerSettingAction): ChordControllerSettingSelectValue {
  const notchTarget = chordNotchTargetForAction(action);
  if (notchTarget) {
    return notchTarget.target.id;
  }
  return action as ChordControllerSettingSelectValue;
}

function chordControllerSettingActionFromSelectValue(
  value: ChordControllerSettingSelectValue,
  currentAction: ChordControllerSettingAction
): ChordControllerSettingAction {
  const target = CHORD_NOTCH_TARGETS.find((candidate) => candidate.id === value);
  if (!target) {
    return value as ChordControllerSettingAction;
  }
  const currentTarget = chordNotchTargetForAction(currentAction);
  return currentTarget?.target.id === target.id && currentTarget.direction === 'down'
    ? target.downAction
    : target.upAction;
}

function chordControllerSettingActionLabel(action: ChordControllerSettingAction): string {
  const notchTarget = chordNotchTargetForAction(action);
  if (notchTarget) {
    return notchTarget.target.label;
  }
  return CHORD_CONTROLLER_SETTING_ACTION_OPTIONS.find(([, value]) => value === action)?.[0] ?? 'Controller Setting';
}

function chordControllerSettingSummary(action: ChordControllerSettingAction, stepPercent?: number): string {
  const notchTarget = chordNotchTargetForAction(action);
  if (notchTarget) {
    const actionText = `${notchTarget.direction === 'up' ? 'Increase' : 'Decrease'} ${notchTarget.target.label}`;
    return typeof stepPercent === 'number'
      ? `${actionText} — ${stepPercent}% step`
      : actionText;
  }
  switch (action) {
    case 'toggle-audio-haptics':
      return 'Toggle Audio Haptics';
    case 'toggle-lightbar-override':
      return 'Toggle Lightbar Override';
    case 'toggle-mic-mute':
      return 'Toggle Mic Mute';
    case 'sleep-controller':
      return 'Sleep Controller';
    case 'persona-dualsense':
      return 'Set Persona: DualSense';
    case 'persona-ds4':
      return 'Set Persona: DualShock 4';
    case 'persona-xbox':
      return 'Set Persona: Xbox';
  }
  return 'Controller Setting';
}

function chordControllerSettingAdjustmentText(action: ChordControllerSettingAction): string {
  const notchTarget = chordNotchTargetForAction(action);
  if (!notchTarget) {
    return chordControllerSettingSummary(action);
  }
  return `${notchTarget.direction === 'up' ? 'Increase' : 'Decrease'} ${notchTarget.target.label}`;
}

function chordStarterLabel(starter: ChordStarterId): string {
  return CHORD_STARTER_OPTIONS.find(([, value]) => value === starter)?.[0] ?? starter.toUpperCase();
}

function chordButtonLabel(button: ChordAssignableButtonId): string {
  return REMAP_BUTTONS[button].label;
}

function chordFunctionSummary(func: ChordFunction): string {
  switch (func.type) {
    case 'keyboard':
      return func.keys.join(' + ');
    case 'media':
      return chordMediaActionLabel(func.action);
    case 'controller-setting':
      return chordControllerSettingSummary(func.action, func.stepPercent);
  }
}

function chordFunctionToDraft(func: ChordFunction | null): ChordFunctionDraft {
  if (!func) {
    return { ...EMPTY_CHORD_FUNCTION_DRAFT };
  }
  const keyboardParts = func.type === 'keyboard'
    ? chordKeyboardParts(func.keys)
    : chordKeyboardParts(DEFAULT_CHORD_KEYBOARD_KEYS);
  return {
    id: func.id,
    name: func.name,
    type: func.type,
    keyboardKey: keyboardParts.key,
    keyboardModifiers: keyboardParts.modifiers,
    mediaAction: func.type === 'media' ? func.action : 'play-pause',
    controllerAction: func.type === 'controller-setting' ? func.action : 'sleep-controller',
    controllerStepPercent: func.type === 'controller-setting'
      ? normalizeChordControllerSettingStepPercent(func.stepPercent)
      : CHORD_CONTROLLER_SETTING_STEP_DEFAULT
  };
}

function normalizeChordKeyLabel(key: string): string {
  const trimmed = key.trim();
  const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
  switch (normalized) {
    case 'control':
    case 'ctrl':
      return 'Ctrl';
    case 'escape':
    case 'esc':
      return 'Esc';
    case 'windows':
    case 'win':
    case 'meta':
      return 'Win';
    case 'spacebar':
    case 'space':
      return 'Space';
    case 'left arrow':
      return 'Left';
    case 'right arrow':
      return 'Right';
    case 'up arrow':
      return 'Up';
    case 'down arrow':
      return 'Down';
    case 'print screen':
    case 'printscreen':
    case 'prtsc':
    case 'prtscn':
    case 'snapshot':
      return 'Print Screen';
    default:
      return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
  }
}

function chordKeyboardParts(keys: string[]): {
  key: string;
  modifiers: ChordKeyboardModifier[];
} {
  const normalizedKeys = keys.map(normalizeChordKeyLabel);
  const modifiers = CHORD_KEYBOARD_MODIFIER_OPTIONS
    .map(([, modifier]) => modifier)
    .filter((modifier) => normalizedKeys.includes(modifier))
    .slice(0, MAX_KEYBOARD_FUNCTION_KEYS - 1);
  const supportedKeys = new Set(CHORD_KEYBOARD_KEY_OPTIONS.map(([, value]) => value));
  const key = normalizedKeys.find((candidate) => supportedKeys.has(candidate)) ?? 'Esc';
  return { key, modifiers };
}

function chordFunctionFromDraft(draft: ChordFunctionDraft): ChordFunction {
  const name = (draft.name.trim() || chordFunctionTypeLabel(draft.type)).slice(0, MAX_CHORD_FUNCTION_NAME_LENGTH);
  const id = draft.id || `function-${Date.now().toString(36)}`;
  switch (draft.type) {
    case 'keyboard':
      return {
        id,
        name,
        type: 'keyboard',
        keys: [...draft.keyboardModifiers, draft.keyboardKey].slice(0, MAX_KEYBOARD_FUNCTION_KEYS)
      };
    case 'media':
      return {
        id,
        name,
        type: 'media',
        action: draft.mediaAction
      };
    case 'controller-setting':
      return {
        id,
        name,
        type: 'controller-setting',
        action: draft.controllerAction,
        stepPercent: normalizeChordControllerSettingStepPercent(draft.controllerStepPercent)
      };
  }
}

function chordAssignmentLabel(assignment: ChordAssignment): string {
  return `${chordStarterLabel(assignment.starter)} + ${chordButtonLabel(assignment.button)}`;
}

function chordBindingKey(starter: ChordStarterId, button: ChordAssignableButtonId): string {
  return `chord:${starter}:${button}`;
}

function chordAssignmentKey(assignment: ChordAssignment): string {
  return chordBindingKey(assignment.starter, assignment.button);
}

function createChordAssignmentId(starter: ChordStarterId, button: ChordAssignableButtonId): string {
  return `chord-${starter}-${button}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function App() {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [startupVisible, setStartupVisible] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activeControlTab, setActiveControlTab] = useState<ControlTab>('game-profile');
  const [hapticsValue, setHapticsValue] = useState(100);
  const [classicRumbleValue, setClassicRumbleValue] = useState(100);
  const [speakerVolumeValue, setSpeakerVolumeValue] = useState(100);
  const [micVolumeValue, setMicVolumeValue] = useState(100);
  const [audioBufferLengthValue, setAudioBufferLengthValue] = useState(64);
  const [lightbarColor, setLightbarColor] = useState('#ffff00');
  const [customLightbarColor, setCustomLightbarColor] = useState<string | null>(() => {
    const saved = window.localStorage.getItem('ds5bridge.customLightbarColor');
    if (!saved || !/^#[0-9a-fA-F]{6}$/.test(saved)) return null;
    const color = normalizeLightbarPresetColor(saved);
    return LIGHTBAR_SWATCHES.includes(color) ? null : color;
  });
  const [customColorDraft, setCustomColorDraft] = useState(LIGHTBAR_DEFAULT_CUSTOM_COLOR);
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const [customSwatchPrimed, setCustomSwatchPrimed] = useState(false);
  const [lightbarBrightnessValue, setLightbarBrightnessValue] = useState(100);
  const [triggerEffectIntensityValue, setTriggerEffectIntensityValue] = useState(100);
  const [audioHapticsOpen, setAudioHapticsOpen] = useState(false);
  const [audioHapticsSessions, setAudioHapticsSessions] = useState<AudioHapticsSession[]>([]);
  const [audioHapticsSessionsLoading, setAudioHapticsSessionsLoading] = useState(false);
  const [triggerProfiles, setTriggerProfiles] = useState<TriggerProfile[]>([]);
  const [triggerProfilesEnabled, setTriggerProfilesEnabled] = useState(false);
  const [triggerProfileEngineStatus, setTriggerProfileEngineStatus] = useState<EngineStatus | null>(null);
  const [gameSettingsStatus, setGameSettingsStatus] = useState<GameSettingsStatus | null>(null);
  const [gameArtwork, setGameArtwork] = useState<Record<string, string>>({});
  const [openGameProfileId, setOpenGameProfileId] = useState<string | null>(null);
  const [gameCreateOpen, setGameCreateOpen] = useState(false);
  const [gameCreateName, setGameCreateName] = useState('');
  const [gameCreateProcessesInput, setGameCreateProcessesInput] = useState('');
  const [gameCreateBusy, setGameCreateBusy] = useState(false);
  const [gameCreateCandidates, setGameCreateCandidates] = useState<GameProcessCandidate[] | null>(null);
  const [gameCreateDetectLoading, setGameCreateDetectLoading] = useState(false);
  const [installedGames, setInstalledGames] = useState<InstalledGamesList | null>(null);
  const [installedGamesLoading, setInstalledGamesLoading] = useState(false);
  const [selectedInstalledGame, setSelectedInstalledGame] = useState<InstalledGamesList['games'][number] | null>(null);
  const [installedCandidateTicks, setInstalledCandidateTicks] = useState<Record<string, boolean>>({});
  const [gameArtworkDialogFor, setGameArtworkDialogFor] = useState<string | null>(null);
  const [gameArtworkQuery, setGameArtworkQuery] = useState('');
  const [gameArtworkResults, setGameArtworkResults] = useState<GameArtworkSearchResult[] | null>(null);
  const [gameArtworkBusy, setGameArtworkBusy] = useState(false);
  const [gameArtworkError, setGameArtworkError] = useState<string | null>(null);
  const [steamGridDbKeyDraft, setSteamGridDbKeyDraft] = useState<string | null>(null);
  const [gameDeleteConfirm, setGameDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [selectedTriggerProfileId, setSelectedTriggerProfileId] = useState<string | null>(null);
  const [triggerProfileDraft, setTriggerProfileDraft] = useState<TriggerProfile | null>(null);
  const [stickSample, setStickSample] = useState<StickSample | null>(null);
  const stickWheelActive = triggerProfileDraft?.switching?.stickWheel !== undefined;
  // Live stick preview for the wheel configurator; only subscribed while a
  // wheel is being edited so the 30Hz sample stream doesn't re-render the app
  // the rest of the time.
  useEffect(() => {
    if (!stickWheelActive) {
      setStickSample(null);
      return;
    }
    return window.bridge.onStickSample(setStickSample);
  }, [stickWheelActive]);
  const [triggerProfileEditingState, setTriggerProfileEditingState] = useState(0);
  const [triggerProfileProcessNamesInput, setTriggerProfileProcessNamesInput] = useState('');
  const [triggerProfileDeleteConfirm, setTriggerProfileDeleteConfirm] = useState<TriggerProfileDeleteConfirmState | null>(null);
  const [triggerProfileResetConfirm, setTriggerProfileResetConfirm] = useState<TriggerProfileDeleteConfirmState | null>(null);
  const [triggerProfileResetting, setTriggerProfileResetting] = useState(false);
  const [triggerProfilesLinked, setTriggerProfilesLinked] = useState(false);
  const [triggerProfileModifiersOpen, setTriggerProfileModifiersOpen] = useState<Record<TriggerProfileSlotKey, boolean>>({ l2: false, r2: false });
  const [triggerProfileTransferStatus, setTriggerProfileTransferStatus] = useState<{
    tone: string;
    message: string;
    failures?: Array<{ file: string; error: string }>;
  } | null>(null);
  const triggerProfileTransferStatusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerStripRef = useRef<HTMLDivElement | null>(null);
  const triggerStripActionsRef = useRef<HTMLDivElement | null>(null);
  const [triggerStripWidth, setTriggerStripWidth] = useState(0);
  const [triggerStripActionsWidth, setTriggerStripActionsWidth] = useState(0);
  const lastAutoMatchedProfileRef = useRef<string | null>(null);
  const [triggerProfileLibraryOpen, setTriggerProfileLibraryOpen] = useState(false);
  const [triggerProfileLibraryCatalog, setTriggerProfileLibraryCatalog] = useState<LibraryCatalog | null>(null);
  const [triggerProfileLibraryLoading, setTriggerProfileLibraryLoading] = useState(false);
  const [triggerProfileLibraryInstalling, setTriggerProfileLibraryInstalling] = useState<string | null>(null);
  const [triggerProfileLibraryInstallErrors, setTriggerProfileLibraryInstallErrors] = useState<Record<string, string>>({});
  const [triggerProfileLibraryQuery, setTriggerProfileLibraryQuery] = useState('');
  const [gameDetectPopoverOpen, setGameDetectPopoverOpen] = useState(false);
  const [gameDetectCandidates, setGameDetectCandidates] = useState<GameProcessCandidate[]>([]);
  const [gameDetectLoading, setGameDetectLoading] = useState(false);
  const gameDetectPopoverRef = useRef<HTMLDivElement>(null);
  // Manual process-match editor for a game profile, opened from the game detail view.
  const [gameProcessEditor, setGameProcessEditor] = useState<{ id: string; name: string } | null>(null);
  const [gameProcessEditorInput, setGameProcessEditorInput] = useState('');
  const [gameProcessEditorSaving, setGameProcessEditorSaving] = useState(false);
  const [gameProcessDetectOpen, setGameProcessDetectOpen] = useState(false);
  const gameProcessDetectRef = useRef<HTMLDivElement>(null);
  const triggerProfilePreviewArmedRef = useRef(false);
  const [remapDraft, setRemapDraft] = useState<Record<RemapButtonId, RemapButtonId>>(DEFAULT_REMAP_DRAFT);
  const [remapProfileDialogMode, setRemapProfileDialogMode] = useState<RemapProfileDialogMode | null>(null);
  const [remapProfileNameDraft, setRemapProfileNameDraft] = useState('');
  const [selectedChordFunctionId, setSelectedChordFunctionId] = useState('');
  const [chordFunctionDraft, setChordFunctionDraft] = useState<ChordFunctionDraft>(EMPTY_CHORD_FUNCTION_DRAFT);
  const [chordFunctionDialog, setChordFunctionDialog] = useState<ChordFunctionDialogState | null>(null);
  const [chordFunctionNameDraft, setChordFunctionNameDraft] = useState('');
  const [chordAssignmentDraftRows, setChordAssignmentDraftRows] = useState<ChordAssignmentDraftRow[]>([]);
  const [draggedChordAssignmentId, setDraggedChordAssignmentId] = useState<string | null>(null);
  const [chordAssignmentDropHint, setChordAssignmentDropHint] = useState<ChordAssignmentDropHint | null>(null);
  const [chordAssignmentScrollbar, setChordAssignmentScrollbar] = useState<ChordAssignmentScrollbarState>({
    visible: false,
    top: 0,
    height: 0
  });
  const [controllerProfileDialogMode, setControllerProfileDialogMode] = useState<ControllerProfileDialogMode | null>(null);
  const [controllerProfileNameDraft, setControllerProfileNameDraft] = useState('');
  const [remapCalloutLayout, setRemapCalloutLayout] = useState<Record<StandardRemapButtonId, RemapCalloutLayout> | null>(null);
  const [edgeRemapControlLayout, setEdgeRemapControlLayout] = useState<Record<DualSenseEdgeRemapButtonId, EdgeRemapControlLayout> | null>(null);
  const [hoveredRemapButton, setHoveredRemapButton] = useState<RemapButtonId | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showBridgeSettings, setShowBridgeSettings] = useState(false);
  const [settingsFocusTarget, setSettingsFocusTarget] = useState<SettingsFocusTarget | null>(null);
  const [notificationFocusTarget, setNotificationFocusTarget] = useState<NotificationFocusTarget | null>(null);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showClassicRumbleControl, setShowClassicRumbleControl] = useState(false);
  const [showMicrophoneControl, setShowMicrophoneControl] = useState(false);
  const [lastRemapControllerType, setLastRemapControllerType] = useState<KnownControllerType>(storedRemapControllerType);
  const [windowDragging, setWindowDragging] = useState(false);
  const [testLocked, setTestLocked] = useState(false);
  const [startupTheme, setStartupTheme] = useState<UiThemePreset>(storedUiThemePreset);
  const [speakerTestLocked, setSpeakerTestLocked] = useState(false);
  const [speakerOutputAvailable, setSpeakerOutputAvailable] = useState<boolean | null>(null);
  const [speakerTestError, setSpeakerTestError] = useState<string | null>(null);
  const [micTestLocked, setMicTestLocked] = useState(false);
  const [micTestError, setMicTestError] = useState<string | null>(null);
  const [hapticsCommitPending, setHapticsCommitPending] = useState(false);
  const [classicRumbleCommitPending, setClassicRumbleCommitPending] = useState(false);
  const [classicRumbleV1CommitPending, setClassicRumbleV1CommitPending] = useState(false);
  const [feedbackBoostCommitPending, setFeedbackBoostCommitPending] = useState(false);
  const [speakerVolumeCommitPending, setSpeakerVolumeCommitPending] = useState(false);
  const [micVolumeCommitPending, setMicVolumeCommitPending] = useState(false);
  const [audioBufferLengthCommitPending, setAudioBufferLengthCommitPending] = useState(false);
  const [audioReactiveHapticsCommitPending, setAudioReactiveHapticsCommitPending] = useState(false);
  const [lightbarCommitPending, setLightbarCommitPending] = useState(false);
  const [overviewSleepConfirmVisible, setOverviewSleepConfirmVisible] = useState(false);
  const [deviceCleanupConfirmVisible, setDeviceCleanupConfirmVisible] = useState(false);
  const [startupTutorialStep, setStartupTutorialStep] = useState<StartupTutorialStep>(storedStartupTutorialStep);
  const [startupTutorialFeatureActive, setStartupTutorialFeatureActive] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' });
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const navHistoryRef = useRef<Array<{ tab: ControlTab; gameId: string | null }>>([
    { tab: 'game-profile', gameId: null }
  ]);
  const navIndexRef = useRef(0);
  const navApplyingRef = useRef(false);
  const applyNavStateRef = useRef<(state: { tab: ControlTab; gameId: string | null }) => void>(() => undefined);

  useEffect(() => {
    const onMouseUp = (event: MouseEvent) => {
      // 3 = browser-back thumb button, 4 = browser-forward.
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      const nextIndex = navIndexRef.current + (event.button === 3 ? -1 : 1);
      const history = navHistoryRef.current;
      if (nextIndex < 0 || nextIndex >= history.length) return;
      navIndexRef.current = nextIndex;
      applyNavStateRef.current(history[nextIndex]);
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);
  const [deviceCleanupMessage, setDeviceCleanupMessage] = useState<string | null>(null);
  const [deviceCleanupError, setDeviceCleanupError] = useState<string | null>(null);

  const startupTutorialOpen = startupTutorialStep !== 'done';
  // Every dialog that renders a .modal-backdrop. The update toast is suppressed while
  // any of them is up, so it can never sit on top of a dialog or first-run setup.
  const anyModalOpen = (
    deviceCleanupConfirmVisible
    || chordFunctionDialog !== null
    || triggerProfileDeleteConfirm !== null
    || triggerProfileResetConfirm !== null
    || remapProfileDialogMode !== null
    || controllerProfileDialogMode !== null
    || triggerProfileLibraryOpen
    || showBridgeSettings
    || gameCreateOpen
    || gameArtworkDialogFor !== null
    || gameDeleteConfirm !== null
  );

  useEffect(() => window.update.onState(setUpdateState), []);

  useEffect(() => {
    void window.appInfo.version().then(setAppVersion);
  }, []);

  useEffect(() => {
    if (startupTutorialOpen) return;
    // Let the window's opening animation settle before anything appears.
    const timer = setTimeout(() => {
      void window.update.check().then(setUpdateState);
    }, 1000);
    return () => clearTimeout(timer);
  }, [startupTutorialOpen]);
  const hapticsEditingRef = useRef(false);
  const classicRumbleEditingRef = useRef(false);
  const speakerVolumeEditingRef = useRef(false);
  const micVolumeEditingRef = useRef(false);
  const audioBufferLengthEditingRef = useRef(false);
  const lightbarBrightnessEditingRef = useRef(false);
  const triggerEffectEditingRef = useRef(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const remappingLayoutRef = useRef<HTMLDivElement>(null);
  const remappingLeftSideRef = useRef<HTMLDivElement>(null);
  const remappingRightSideRef = useRef<HTMLDivElement>(null);
  const remappingArtRef = useRef<HTMLImageElement>(null);
  const customColorPickerRef = useRef<HTMLDivElement>(null);
  const customSwatchPrimeTimerRef = useRef<number | null>(null);
  const overviewSleepConfirmTimerRef = useRef<number | null>(null);
  const settingsFocusTimerRef = useRef<number | null>(null);
  const notificationFocusTimerRef = useRef<number | null>(null);
  const chordAssignmentDragRef = useRef<ChordAssignmentDragSession | null>(null);
  const chordAssignmentListRef = useRef<HTMLDivElement>(null);
  const windowDraggingRef = useRef(false);
  const windowDragReleaseTimerRef = useRef<number | null>(null);
  const startupReadyTimerRef = useRef<number | null>(null);
  const startupReadyArmedRef = useRef(false);
  const deferredSnapshotRef = useRef<BridgeSnapshot | null>(null);
  const overviewSleepConfirmArmedRef = useRef(false);
  useEffect(() => () => {
    const session = chordAssignmentDragRef.current;
    session?.cleanup();
    session?.overlay?.remove();
    document.body.classList.remove('chords-assignment-pointer-dragging');
    chordAssignmentDragRef.current = null;
  }, []);

  useEffect(() => {
    const liveTheme = snapshot?.settings.uiThemePreset;
    if (!liveTheme) return;
    setStartupTheme(liveTheme);
    saveUiThemePreset(liveTheme);
  }, [snapshot?.settings.uiThemePreset]);

  useEffect(() => {
    const hasSnapshot = Boolean(snapshot);
    if (!hasSnapshot || !startupVisible || startupReadyArmedRef.current) return undefined;
    startupReadyArmedRef.current = true;
    startupReadyTimerRef.current = window.setTimeout(() => {
      setStartupVisible(false);
      startupReadyTimerRef.current = null;
    }, STARTUP_READY_HOLD_MS);
    return () => {
      if (startupReadyTimerRef.current !== null) {
        window.clearTimeout(startupReadyTimerRef.current);
        startupReadyTimerRef.current = null;
      }
    };
  }, [Boolean(snapshot), startupVisible]);

  const personaTransition = snapshot?.personaTransition ?? null;
  const personaTransitionActive = Boolean(personaTransition);
  const connected = snapshot?.state === 'connected';
  const controllerConnected = Boolean(snapshot?.status?.controllerConnected);
  const controllerControlsAvailable = connected && controllerConnected;
  const liveControllerType = snapshot?.status?.controllerType;
  const remapControllerType = snapshot?.status?.controllerConnected && liveControllerType && liveControllerType !== 'unknown'
    ? liveControllerType
    : lastRemapControllerType;
  const showDualSenseEdgeRemapButtons = remapControllerType === 'dualsense-edge';
  const remapModifiedCount = useMemo(() => (
    REMAP_ALL_BUTTON_IDS.filter((buttonId) => remapDraft[buttonId] !== buttonId).length
  ), [remapDraft]);
  const triggerProfileLibraryRows = useMemo(() => (
    triggerProfileLibraryCatalog
      ? filterLibrary(triggerProfileLibraryCatalog, triggerProfileLibraryQuery)
      : []
  ), [triggerProfileLibraryCatalog, triggerProfileLibraryQuery]);
  // Library files already installed, so the library can offer Install only for what is not.
  const installedLibraryFiles = useMemo(() => new Set(
    triggerProfiles
      .map((profile) => profile.meta?.libraryFile)
      .filter((file): file is string => typeof file === 'string')
  ), [triggerProfiles]);
  const selectedControllerProfile = snapshot?.settings.controllerProfiles.find((profile) => (
    profile.id === snapshot.settings.selectedControllerProfileId
  ));
  const selectedControllerProfileId = selectedControllerProfile?.id ?? DEFAULT_CONTROLLER_PROFILE_ID;
  const controllerProfileOptions = useMemo<Array<[string, string]>>(() => (
    snapshot
      ? visibleProfileOptions(snapshot.settings.controllerProfiles, snapshot.settings.selectedControllerProfileId)
      : [['Default', DEFAULT_CONTROLLER_PROFILE_ID]]
  ), [snapshot?.settings.controllerProfiles, snapshot?.settings.selectedControllerProfileId]);
  const selectedControllerProfileIsDefault = selectedControllerProfileId === DEFAULT_CONTROLLER_PROFILE_ID;
  const selectedControllerProfileIsGameOwned = isGameSettingsProfileId(selectedControllerProfileId);
  const canDeleteControllerProfile = !selectedControllerProfileIsDefault && !selectedControllerProfileIsGameOwned;
  const selectedRemapProfile = snapshot?.settings.buttonRemappingProfiles.find((profile) => (
    profile.id === snapshot.settings.selectedButtonRemappingProfileId
  ));
  const selectedRemapProfileId = selectedRemapProfile?.id ?? DEFAULT_BUTTON_REMAP_PROFILE_ID;
  const remapProfileOptions = useMemo<Array<[string, string]>>(() => (
    snapshot
      ? visibleProfileOptions(snapshot.settings.buttonRemappingProfiles, snapshot.settings.selectedButtonRemappingProfileId)
      : [['Default', DEFAULT_BUTTON_REMAP_PROFILE_ID]]
  ), [snapshot?.settings.buttonRemappingProfiles, snapshot?.settings.selectedButtonRemappingProfileId]);
  const selectedRemapProfileIsDefault = selectedRemapProfileId === DEFAULT_BUTTON_REMAP_PROFILE_ID;
  const selectedRemapProfileIsGameOwned = isGameSettingsProfileId(selectedRemapProfileId);
  // Game Profile tiles are the saved trigger profiles: the Default fallback and unsaved
  // editor drafts are not games.
  const gameProfiles = useMemo(() => (
    triggerProfiles.filter((profile) => (
      profile.id !== DEFAULT_PROFILE_ID && !isProvisionalTriggerProfileId(profile.id)
    ))
  ), [triggerProfiles]);
  // The OpenDS5-Profiles catalog drives what a new game gets (native / published
  // profile / nothing) and the NATIVE badge on existing tiles. Loaded once here;
  // the library dialog refreshes it when opened.
  useEffect(() => {
    void window.bridge.getProfileLibraryCatalog()
      .then(setTriggerProfileLibraryCatalog)
      .catch(() => undefined);
  }, []);
  const nativeFeatureMap = useMemo(
    () => nativeGameFeatureMap(triggerProfileLibraryCatalog),
    [triggerProfileLibraryCatalog]
  );
  // Game entries without custom effects ride the Default profile: they exist
  // for detection/settings/artwork and are managed from the Game Profile tab.
  // Showing them here would read as "adding a game created a trigger profile".
  // The one exception is the profile currently selected for editing — that is
  // exactly how a (non-native) game gets its first effects.
  const triggerStripProfiles = useMemo(() => (
    triggerProfiles.filter((profile) => (
      !profile.meta?.game
      || triggerProfileHasEffects(profile)
      || profile.id === selectedTriggerProfileId
    ))
  ), [triggerProfiles, selectedTriggerProfileId]);
  const openGameProfileEntry = openGameProfileId
    ? gameProfiles.find((profile) => profile.id === openGameProfileId) ?? null
    : null;
  const activeGameProfile = triggerProfileEngineStatus
    && triggerProfileEngineStatus.enabled
    && triggerProfileEngineStatus.activeProfileId !== DEFAULT_PROFILE_ID
    ? gameProfiles.find((profile) => profile.id === triggerProfileEngineStatus.activeProfileId) ?? null
    : null;
  const gameSettingsScope: 'game' | 'global' = openGameProfileId !== null
    && gameSettingsStatus?.editingProfileId === openGameProfileId
    ? 'game'
    : 'global';
  const gameHasSettings = (profileId: string): boolean => (
    snapshot?.settings.controllerProfiles.some((profile) => profile.id === gameSettingsProfileId(profileId)) ?? false
  );
  const remappingLayoutAsset = showDualSenseEdgeRemapButtons ? REMAP_EDGE_LAYOUT_ASSET : REMAP_STANDARD_LAYOUT_ASSET;
  const chordFunctions = snapshot?.settings.chordFunctions ?? [];
  const chordAssignments = snapshot?.settings.chordAssignments ?? [];
  const muteButtonChordStarterActive = snapshot?.settings.muteButtonMode === 'chord'
    || (
      snapshot?.settings.muteButtonMode === 'keyboard'
      && snapshot.settings.muteKeyboardChordStarterEnabled
    );
  const selectedChordFunction = chordFunctions.find((func) => func.id === selectedChordFunctionId) ?? chordFunctions[0] ?? null;
  const chordFunctionDialogFunction = chordFunctionDialog
    ? chordFunctions.find((func) => func.id === chordFunctionDialog.functionId) ?? null
    : null;
  const chordAssignmentConflictState = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of chordAssignments) {
      const key = chordAssignmentKey(assignment);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const conflictKeys = new Set<string>();
    let conflictCount = 0;
    for (const [key, count] of counts) {
      if (count > 1) {
        conflictKeys.add(key);
        conflictCount += count - 1;
      }
    }
    const shortcutKeys = new Set<string>();
    if (snapshot?.settings.sleepKeybindEnabled) {
      shortcutKeys.add(chordBindingKey('ps', 'triangle'));
    }
    if (snapshot?.settings.speakerVolumeShortcutEnabled) {
      shortcutKeys.add(chordBindingKey('ps', 'dpad-up'));
      shortcutKeys.add(chordBindingKey('ps', 'dpad-down'));
    }
    for (const assignment of chordAssignments) {
      const key = chordAssignmentKey(assignment);
      if (shortcutKeys.has(key)) {
        conflictKeys.add(key);
        conflictCount += 1;
      }
      if (assignment.starter === CHORD_MUTE_STARTER_ID && !muteButtonChordStarterActive) {
        conflictKeys.add(key);
        conflictCount += 1;
      }
    }
    return { conflictKeys, conflictCount };
  }, [
    chordAssignments,
    muteButtonChordStarterActive,
    snapshot?.settings.sleepKeybindEnabled,
    snapshot?.settings.speakerVolumeShortcutEnabled
  ]);
  const chordFunctionsSignature = useMemo(() => (
    chordFunctions.map((func) => `${func.id}:${func.name}:${chordFunctionSummary(func)}`).join('|')
  ), [chordFunctions]);
  const chordFunctionOptions = useMemo<Array<[string, string]>>(() => (
    chordFunctions.length > 0
      ? chordFunctions.map((func) => [func.name, func.id])
      : [['No Functions', '']]
  ), [chordFunctions]);
  const defaultChordFunctionId = selectedChordFunction?.id ?? chordFunctions[0]?.id ?? '';
  const chordStarterOptions = useMemo<Array<[string, ChordStarterId]>>(() => (
    CHORD_STARTER_OPTIONS.filter(([, starter]) => {
      if (starter === CHORD_MUTE_STARTER_ID) {
        return muteButtonChordStarterActive;
      }
      return starter === 'ps' || showDualSenseEdgeRemapButtons;
    })
  ), [muteButtonChordStarterActive, showDualSenseEdgeRemapButtons]);
  const chordAssignableButtonIds = useMemo<readonly ChordAssignableButtonId[]>(() => (
    (showDualSenseEdgeRemapButtons
      ? CHORD_BUTTON_MENU_IDS
      : REMAP_STANDARD_TARGET_BUTTON_IDS) as readonly ChordAssignableButtonId[]
  ), [showDualSenseEdgeRemapButtons]);
  function chordStarterOptionsFor(currentStarter?: ChordStarterId): Array<[string, ChordStarterId]> {
    return currentStarter === CHORD_MUTE_STARTER_ID
      && !chordStarterOptions.some(([, starter]) => starter === CHORD_MUTE_STARTER_ID)
      ? [...chordStarterOptions, [CHORD_STARTERS.mute.label, CHORD_MUTE_STARTER_ID]]
      : chordStarterOptions;
  }
  function muteChordStarterIsInactive(starter: ChordStarterId): boolean {
    return starter === CHORD_MUTE_STARTER_ID && !muteButtonChordStarterActive;
  }
  function chordButtonOptionsFor(
    starter: ChordStarterId,
    includeUnassigned = false
  ): Array<[string, ChordButtonSelectValue]> {
    const ids = chordAssignableButtonIds;
    const options = ids
      .filter((id) => isChordBindingAllowed(starter, id))
      .map((id): [string, ChordButtonSelectValue] => [chordButtonLabel(id), id]);
    return includeUnassigned
      ? [['Choose Button', CHORD_UNASSIGNED_BUTTON], ...options]
      : options;
  }
  function firstAllowedChordButton(starter: ChordStarterId): ChordAssignableButtonId | null {
    return chordAssignableButtonIds.find((id) => isChordBindingAllowed(starter, id)) ?? null;
  }
  const canAddChordDraft = Boolean(defaultChordFunctionId)
    && chordAssignments.length + chordAssignmentDraftRows.length < MAX_CHORD_ASSIGNMENTS;
  const chordAssignmentsSubtitle = muteButtonChordStarterActive
    ? (showDualSenseEdgeRemapButtons ? 'Pair PS, LFN, RFN, or Mute with a button.' : 'Pair PS or Mute with a button.')
    : (showDualSenseEdgeRemapButtons ? 'Pair PS, LFN, or RFN with a button.' : 'Pair PS with a button.');

  useEffect(() => {
    const list = chordAssignmentListRef.current;
    if (!list || activeControlTab !== 'chords') {
      return;
    }
    const frame = window.requestAnimationFrame(updateChordAssignmentScrollbar);
    const observer = new ResizeObserver(updateChordAssignmentScrollbar);
    observer.observe(list);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    activeControlTab,
    chordAssignments.length,
    chordAssignmentDraftRows.length
  ]);

  useEffect(() => {
    if (snapshot?.status?.controllerConnected && liveControllerType && liveControllerType !== 'unknown') {
      setLastRemapControllerType(liveControllerType);
      window.localStorage.setItem(LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY, liveControllerType);
    }
  }, [liveControllerType, snapshot?.status?.controllerConnected]);

  useEffect(() => {
    if (chordFunctions.length === 0) {
      setSelectedChordFunctionId('');
      setChordFunctionDraft(EMPTY_CHORD_FUNCTION_DRAFT);
      setChordAssignmentDraftRows([]);
      return;
    }
    const nextSelected = chordFunctions.find((func) => func.id === selectedChordFunctionId) ?? chordFunctions[0]!;
    if (nextSelected.id !== selectedChordFunctionId) {
      setSelectedChordFunctionId(nextSelected.id);
    }
    setChordFunctionDraft(chordFunctionToDraft(nextSelected));
  }, [chordFunctionsSignature]);

  useEffect(() => {
    setChordAssignmentDraftRows((rows) => rows
      .map((row) => {
        const rowStarterOptions = chordStarterOptionsFor(row.starter);
        const starter = rowStarterOptions.some(([, option]) => option === row.starter) ? row.starter : 'ps';
        const functionId = chordFunctions.some((func) => func.id === row.functionId)
          ? row.functionId
          : defaultChordFunctionId;
        const button = row.button
          && chordAssignableButtonIds.includes(row.button)
          && isChordBindingAllowed(starter, row.button)
          ? row.button
          : null;
        return functionId ? { ...row, starter, button, functionId } : null;
      })
      .filter((row): row is ChordAssignmentDraftRow => row !== null));
  }, [chordAssignableButtonIds, chordFunctionsSignature, chordStarterOptions, defaultChordFunctionId]);

  function applySnapshot(next: BridgeSnapshot) {
    setSnapshot(next);
    setRemapDraft(next.settings.buttonRemappingDraft);
    if (!hapticsEditingRef.current) {
      setHapticsValue(displayHapticsValue(next));
    }
    if (!classicRumbleEditingRef.current) {
      setClassicRumbleValue(displayClassicRumbleValue(next));
    }
    if (!speakerVolumeEditingRef.current) {
      setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
    }
    if (!micVolumeEditingRef.current) {
      setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
    }
    if (!audioBufferLengthEditingRef.current) {
      setAudioBufferLengthValue(clampAudioBufferLength(next.settings.hapticsBufferLength));
    }
    const nextLightbarColor = lightbarColorFromSnapshot(next);
    setLightbarColor(nextLightbarColor);
    if (!isLightbarPresetColor(nextLightbarColor)) {
      setCustomLightbarColor(nextLightbarColor);
      setCustomColorDraft(nextLightbarColor);
      window.localStorage.setItem('ds5bridge.customLightbarColor', nextLightbarColor);
    }
    if (!lightbarBrightnessEditingRef.current) {
      setLightbarBrightnessValue(displayLightbarBrightnessValue(next));
    }
    if (!triggerEffectEditingRef.current) {
      setTriggerEffectIntensityValue(displayTriggerEffectIntensityValue(next));
    }
  }

  function finishWindowDrag() {
    windowDraggingRef.current = false;
    setWindowDragging(false);
    if (windowDragReleaseTimerRef.current !== null) {
      window.clearTimeout(windowDragReleaseTimerRef.current);
      windowDragReleaseTimerRef.current = null;
    }
    const deferredSnapshot = deferredSnapshotRef.current;
    deferredSnapshotRef.current = null;
    if (deferredSnapshot) {
      applySnapshot(deferredSnapshot);
    }
  }

  function beginWindowDrag() {
    windowDraggingRef.current = true;
    setWindowDragging(true);
    if (windowDragReleaseTimerRef.current !== null) {
      window.clearTimeout(windowDragReleaseTimerRef.current);
    }
    windowDragReleaseTimerRef.current = window.setTimeout(finishWindowDrag, 1600);
    window.addEventListener('mouseup', finishWindowDrag, { once: true });
    window.addEventListener('blur', finishWindowDrag, { once: true });
  }

  const audioReactiveHapticsSource = snapshot?.settings.audioReactiveHapticsSource ?? 'system-audio';
  const audioReactiveHapticsSourceKey = audioHapticsSourceKey(audioReactiveHapticsSource);

  useEffect(() => {
    let cancelled = false;
    let receivedLiveSnapshot = false;
    window.bridge.getStatus().then((next) => {
      if (!cancelled && !receivedLiveSnapshot) {
        applySnapshot(next);
      }
    });
    const unsubscribe = window.bridge.onSnapshot((next) => {
      receivedLiveSnapshot = true;
      if (windowDraggingRef.current) {
        deferredSnapshotRef.current = next;
        return;
      }
      applySnapshot(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      if (customSwatchPrimeTimerRef.current !== null) {
        window.clearTimeout(customSwatchPrimeTimerRef.current);
      }
      if (overviewSleepConfirmTimerRef.current !== null) {
        window.clearTimeout(overviewSleepConfirmTimerRef.current);
      }
      if (settingsFocusTimerRef.current !== null) {
        window.clearTimeout(settingsFocusTimerRef.current);
      }
      if (notificationFocusTimerRef.current !== null) {
        window.clearTimeout(notificationFocusTimerRef.current);
      }
      if (windowDragReleaseTimerRef.current !== null) {
        window.clearTimeout(windowDragReleaseTimerRef.current);
      }
      if (startupReadyTimerRef.current !== null) {
        window.clearTimeout(startupReadyTimerRef.current);
      }
      if (triggerProfileTransferStatusTimeout.current !== null) {
        clearTimeout(triggerProfileTransferStatusTimeout.current);
      }
      window.removeEventListener('mouseup', finishWindowDrag);
      window.removeEventListener('blur', finishWindowDrag);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.bridge.listTriggerProfiles().then((profiles) => {
      if (cancelled) return;
      setTriggerProfiles(profiles);
      if (profiles.length > 0) {
        loadTriggerProfileDraft(profiles[0]);
      }
    });
    window.bridge.getTriggerProfileEngineStatus().then((status) => {
      if (cancelled) return;
      setTriggerProfilesEnabled(status.enabled);
      setTriggerProfileEngineStatus(status);
    });
    const unsubscribe = window.bridge.onTriggerProfileEngineStatus((status) => {
      setTriggerProfilesEnabled(status.enabled);
      setTriggerProfileEngineStatus(status);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    window.bridge.getGameSettingsStatus().then((status) => {
      if (!cancelled) setGameSettingsStatus(status);
    });
    window.bridge.getGameArtwork().then((urls) => {
      if (!cancelled) setGameArtwork(urls);
    });
    const unsubscribe = window.bridge.onGameSettingsStatus(setGameSettingsStatus);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Track the profile strip's width so the chip row adapts to the window size,
  // collapsing into the overflow dropdown when the strip gets too narrow.
  // The strip only exists once the startup screen is gone, so this effect must
  // key on that transition — with [] deps it would run against null refs and
  // never observe anything.
  const mainUiMounted = Boolean(snapshot) && !startupVisible;
  useEffect(() => {
    if (!mainUiMounted) return;
    const strip = triggerStripRef.current;
    const actions = triggerStripActionsRef.current;
    if (!strip || !actions || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (entry.target === strip) setTriggerStripWidth(width);
        else if (entry.target === actions) setTriggerStripActionsWidth(width);
      }
    });
    observer.observe(strip);
    observer.observe(actions);
    return () => observer.disconnect();
  }, [mainUiMounted]);

  // The editor always shows the profile that is actually driving the triggers, however it became
  // active: a matched game, a pin, or the default fallback. Following only process matches left
  // the editor on a profile the controller was not using -- e.g. auto mode falls back to Default
  // while the strip still highlights the last profile opened.
  useEffect(() => {
    const status = triggerProfileEngineStatus;
    if (!status?.activeProfileId) return;
    if (lastAutoMatchedProfileRef.current === status.activeProfileId) return;
    const profile = triggerProfiles.find((entry) => entry.id === status.activeProfileId);
    if (!profile) return;
    lastAutoMatchedProfileRef.current = status.activeProfileId;
    loadTriggerProfileDraft(profile);
  }, [triggerProfileEngineStatus, triggerProfiles]);

  // Live-preview edited trigger draft effects on the controller (debounced);
  // armed only after an actual trigger edit so selecting a profile never writes.
  useEffect(() => {
    if (!triggerProfilePreviewArmedRef.current) return;
    if (activeControlTab !== 'trigger-profiles' || !triggerProfileDraft) return;
    const triggers = editingStateTriggers(triggerProfileDraft, triggerProfileEditingState);
    const handle = setTimeout(() => {
      void window.bridge.previewTriggerProfileDraft({ l2: triggers.l2, r2: triggers.r2 });
    }, 150);
    return () => clearTimeout(handle);
  }, [triggerProfileDraft, triggerProfileEditingState, activeControlTab]);

  // Clear any live draft preview when leaving the Trigger Profiles tab.
  useEffect(() => {
    if (activeControlTab === 'trigger-profiles') return;
    if (!triggerProfilePreviewArmedRef.current) return;
    triggerProfilePreviewArmedRef.current = false;
    void window.bridge.previewTriggerProfileDraft(null);
  }, [activeControlTab]);

  // Clear any live draft preview on unmount.
  useEffect(() => () => {
    if (triggerProfilePreviewArmedRef.current) {
      void window.bridge.previewTriggerProfileDraft(null);
    }
  }, []);

  useEffect(() => {
    const controllerAudioReady = connected && controllerConnected;
    if (!audioHapticsOpen || !controllerAudioReady) {
      setAudioHapticsSessions([]);
      setAudioHapticsSessionsLoading(false);
      return undefined;
    }

    let cancelled = false;
    let refreshInFlight = false;
    async function refreshSessions() {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      setAudioHapticsSessionsLoading(true);
      try {
        const sessions = await window.bridge.listAudioHapticsSessions();
        if (!cancelled) {
          setAudioHapticsSessions(sessions);
        }
      } catch {
        if (!cancelled) {
          setAudioHapticsSessions([]);
        }
      } finally {
        refreshInFlight = false;
        if (!cancelled) {
          setAudioHapticsSessionsLoading(false);
        }
      }
    }

    void refreshSessions();
    const interval = window.setInterval(refreshSessions, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [audioHapticsOpen, audioReactiveHapticsSourceKey, connected, controllerConnected]);

  useEffect(() => {
    if (!showBridgeSettings && !showNotificationsMenu && !triggerProfileLibraryOpen) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (showNotificationsMenu && !notificationsRef.current?.contains(event.target as Node)) {
        setShowNotificationsMenu(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowBridgeSettings(false);
        setShowNotificationsMenu(false);
        setTriggerProfileLibraryOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showBridgeSettings, showNotificationsMenu, triggerProfileLibraryOpen]);

  useEffect(() => {
    setSpeakerOutputAvailable(true);
  }, []);

  useEffect(() => {
    if (activeControlTab !== 'remapping') {
      return undefined;
    }

    const leftSide = remappingLeftSideRef.current;
    const rightSide = remappingRightSideRef.current;
    const layout = remappingLayoutRef.current;
    const art = remappingArtRef.current;
    if (!leftSide || !rightSide || !layout || !art) {
      return undefined;
    }
    const leftSideElement = leftSide;
    const rightSideElement = rightSide;
    const layoutElement = layout;
    const artElement = art;

    function updateRemapCalloutPositions() {
      const artRect = artElement.getBoundingClientRect();
      const leftRect = leftSideElement.getBoundingClientRect();
      const rightRect = rightSideElement.getBoundingClientRect();
      const layoutRect = layoutElement.getBoundingClientRect();
      const layoutScaleX = layoutRect.width / layoutElement.offsetWidth || 1;
      const layoutScaleY = layoutRect.height / layoutElement.offsetHeight || 1;
      const toLocalX = (clientX: number) => (clientX - layoutRect.left) / layoutScaleX;
      const toLocalY = (clientY: number) => (clientY - layoutRect.top) / layoutScaleY;
      const artLeft = toLocalX(artRect.left);
      const artTop = toLocalY(artRect.top);
      const artWidth = artRect.width / layoutScaleX;
      const artHeight = artRect.height / layoutScaleY;
      const leftTop = toLocalY(leftRect.top);
      const rightTop = toLocalY(rightRect.top);
      const viewBoxAspect = remappingLayoutAsset.viewBoxWidth / remappingLayoutAsset.viewBoxHeight;
      const renderedSvgHeight = Math.min(artHeight, artWidth / viewBoxAspect);
      const renderedSvgWidth = renderedSvgHeight * viewBoxAspect;
      const renderedSvgTop = artTop + (artHeight - renderedSvgHeight) / 2;
      const renderedSvgLeft = artLeft + (artWidth - renderedSvgWidth) / 2;
      const nextLayout = {} as Record<StandardRemapButtonId, RemapCalloutLayout>;
      const mapSvgPoint = ([x, y]: [number, number]) => (
        `${renderedSvgLeft + (x / remappingLayoutAsset.viewBoxWidth) * renderedSvgWidth},${renderedSvgTop + (y / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight}`
      );
      const mapSvgX = (x: number) => renderedSvgLeft + (x / remappingLayoutAsset.viewBoxWidth) * renderedSvgWidth;
      const mapSvgY = (y: number) => renderedSvgTop + (y / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight;
      const remapPillEdgeX = (side: HTMLElement, buttonId: StandardRemapButtonId, edge: 'left' | 'right') => {
        const pill = side.querySelector<HTMLElement>(`[data-remap-button-id="${buttonId}"]`);
        if (!pill) {
          return edge === 'right' ? toLocalX(side.getBoundingClientRect().right) : toLocalX(side.getBoundingClientRect().left);
        }
        const pillRect = pill.getBoundingClientRect();
        return toLocalX(edge === 'right' ? pillRect.right : pillRect.left);
      };

      for (const buttonId of REMAP_LEFT_BUTTON_IDS) {
        const top = renderedSvgTop + (remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight - leftTop;
        const pillRightX = remapPillEdgeX(leftSideElement, buttonId, 'right');
        nextLayout[buttonId] = {
          top,
          points: [
            `${pillRightX},${leftTop + top}`,
            ...remappingLayoutAsset.calloutPoints[buttonId].map(mapSvgPoint)
          ].join(' ')
        };
      }
      for (const buttonId of REMAP_RIGHT_BUTTON_IDS) {
        const top = renderedSvgTop + (remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight - rightTop;
        const pillLeftX = remapPillEdgeX(rightSideElement, buttonId, 'left');
        nextLayout[buttonId] = {
          top,
          points: [
            `${pillLeftX},${rightTop + top}`,
            ...remappingLayoutAsset.calloutPoints[buttonId].map(mapSvgPoint)
          ].join(' ')
        };
      }

      setRemapCalloutLayout((current) => {
        if (current && REMAP_STANDARD_BUTTON_IDS.every((buttonId) => (
          Math.abs(current[buttonId].top - nextLayout[buttonId].top) < 0.5
          && current[buttonId].points === nextLayout[buttonId].points
        ))) {
          return current;
        }
        return nextLayout;
      });

      if (showDualSenseEdgeRemapButtons) {
        const nextEdgeLayout = {} as Record<DualSenseEdgeRemapButtonId, EdgeRemapControlLayout>;
        for (const buttonId of REMAP_EDGE_BUTTON_IDS) {
          const point = REMAP_EDGE_CONTROL_POINTS[buttonId];
          nextEdgeLayout[buttonId] = {
            left: mapSvgX(point.x),
            top: mapSvgY(point.y),
            anchor: point.anchor,
            linePoints: REMAP_EDGE_LINE_POINTS[buttonId].map(mapSvgPoint).join(' ')
          };
        }
        setEdgeRemapControlLayout((current) => {
          if (current && REMAP_EDGE_BUTTON_IDS.every((buttonId) => (
            Math.abs(current[buttonId].left - nextEdgeLayout[buttonId].left) < 0.5
            && Math.abs(current[buttonId].top - nextEdgeLayout[buttonId].top) < 0.5
            && current[buttonId].anchor === nextEdgeLayout[buttonId].anchor
            && current[buttonId].linePoints === nextEdgeLayout[buttonId].linePoints
          ))) {
            return current;
          }
          return nextEdgeLayout;
        });
      } else {
        setEdgeRemapControlLayout(null);
      }
    }

    updateRemapCalloutPositions();
    const resizeObserver = new ResizeObserver(updateRemapCalloutPositions);
    resizeObserver.observe(leftSideElement);
    resizeObserver.observe(rightSideElement);
    resizeObserver.observe(layoutElement);
    resizeObserver.observe(artElement);
    window.addEventListener('resize', updateRemapCalloutPositions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateRemapCalloutPositions);
    };
  }, [activeControlTab, remappingLayoutAsset, showDualSenseEdgeRemapButtons]);

  useEffect(() => {
    if (!connected) {
      setSpeakerTestError(null);
    }
  }, [connected]);

  useEffect(() => {
    if (!showCustomColorPicker) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!customColorPickerRef.current?.contains(event.target as Node)) {
        setShowCustomColorPicker(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCustomColorPicker(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showCustomColorPicker]);

  useEffect(() => {
    if (!gameDetectPopoverOpen) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!gameDetectPopoverRef.current?.contains(event.target as Node)) {
        setGameDetectPopoverOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGameDetectPopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [gameDetectPopoverOpen]);

  useEffect(() => {
    if (!gameProcessDetectOpen) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!gameProcessDetectRef.current?.contains(event.target as Node)) {
        setGameProcessDetectOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGameProcessDetectOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [gameProcessDetectOpen]);

  async function detectRunningGame(): Promise<void> {
    setGameDetectLoading(true);
    try {
      const candidates = await window.bridge.listCandidateGameProcesses();
      setGameDetectCandidates(candidates);
      setGameDetectPopoverOpen(true);
    } finally {
      setGameDetectLoading(false);
    }
  }

  function pickDetectedGameProcess(candidateName: string): void {
    setTriggerProfileProcessNamesInput((current) => mergeDetectedProcessName(current, candidateName));
  }

  function openGameProcessEditor(profile: TriggerProfile): void {
    setGameProcessEditor({ id: profile.id, name: gameProfileTitle(profile) });
    setGameProcessEditorInput(profile.match.processNames.join(', '));
    setGameProcessDetectOpen(false);
  }

  // Same "Detect running game" flow as the trigger editor, but targets the game process editor.
  async function detectRunningGameForEditor(): Promise<void> {
    setGameDetectLoading(true);
    try {
      const candidates = await window.bridge.listCandidateGameProcesses();
      setGameDetectCandidates(candidates);
      setGameProcessDetectOpen(true);
    } finally {
      setGameDetectLoading(false);
    }
  }

  function pickDetectedGameProcessForEditor(candidateName: string): void {
    setGameProcessEditorInput((current) => mergeDetectedProcessName(current, candidateName));
    setGameProcessDetectOpen(false);
  }

  async function saveGameProcessNames(): Promise<void> {
    if (!gameProcessEditor) return;
    const target = triggerProfiles.find((profile) => profile.id === gameProcessEditor.id);
    if (!target) {
      setGameProcessEditor(null);
      return;
    }
    const processNames = parseProcessNamesInput(gameProcessEditorInput);
    setGameProcessEditorSaving(true);
    try {
      const profile: TriggerProfile = {
        ...target,
        match: { ...target.match, processNames },
        updatedAtMs: Date.now()
      };
      const saved = await window.bridge.saveTriggerProfile(profile);
      await refreshTriggerProfiles(saved.id);
      setGameProcessEditor(null);
    } finally {
      setGameProcessEditorSaving(false);
    }
  }

  const batteryPercent = Math.max(0, Math.min(100, snapshot?.status?.batteryPercent ?? 0));
  const batteryPercentLabel = batteryLabel(snapshot);
  const batteryLevelTone = batteryTone(snapshot?.status?.batteryPercent);
  const batteryCharging = isChargingPowerState(snapshot?.status?.rawPowerState);
  const batterySegmentCount = connected
    ? batteryPercent >= 67
      ? 3
      : batteryPercent >= 34
        ? 2
        : batteryPercent > 0
          ? 1
          : 0
    : 0;
  const batteryChargingSegment = connected && batteryCharging && batteryPercent < 100
    ? Math.min(2, batterySegmentCount)
    : -1;
  const batteryCritical = connected && !batteryCharging && batteryPercent > 0 && batteryPercent <= 20;
  const statusTone = personaTransitionActive
    ? 'warn'
    : connected
      ? 'good'
      : snapshot?.state === 'error' || snapshot?.state === 'incompatible'
        ? 'bad'
        : 'idle';
  const lastAck = snapshot?.diagnostics.lastAck;
  const speakerVolumeSupported = Boolean(snapshot?.status?.firmwareFlags.speakerVolumeControl);
  const lightbarSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarControl);
  const lightbarOverrideSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarOverrideControl);
  const muteButtonActionsSupported = Boolean(snapshot?.status?.firmwareFlags.muteButtonActions);
  const adaptiveTriggersSupported = Boolean(snapshot?.status?.firmwareFlags.adaptiveTriggersControl);
  const usbSuspendDisconnectSupported = Boolean(snapshot?.status?.firmwareFlags.usbSuspendDisconnectControl);
  const sleepControllerSupported = Boolean(snapshot?.status?.firmwareFlags.sleepControllerControl);
  const pollingRateControlSupported = Boolean(snapshot?.status?.firmwareFlags.pollingRateControl);
  const hostPersonaControlSupported = Boolean(snapshot?.status?.firmwareFlags.hostPersonaControl);
  const audioBufferLengthControlSupported = Boolean(snapshot?.status?.firmwareFlags.hapticsBufferLengthControl);
  const audioReactiveHapticsSupported = Boolean(snapshot?.status?.firmwareFlags.audioReactiveHapticsControl);
  const supportedHostPersonaModes: HostPersonaMode[] = snapshot?.status?.supportedHostPersonaModes ?? ['dualsense'];
  const hostPersonaOptions = HOST_PERSONA_OPTIONS.filter(([, mode]) => (
    supportedHostPersonaModes.includes(mode) || snapshot?.settings.hostPersonaMode === mode
  ));
  const overviewHostPersonaMode = personaTransition?.to ?? snapshot?.settings.hostPersonaMode ?? 'dualsense';
  const hapticsEnabled = Boolean(snapshot?.settings.hapticsEnabled);
  const audioReactiveHapticsEnabled = Boolean(snapshot?.settings.audioReactiveHapticsEnabled);
  const audioHapticsSessionByKey = useMemo(() => {
    const sessions = new Map<string, AudioHapticsSession>();
    for (const session of audioHapticsSessions) {
      sessions.set(audioHapticsSessionKey(session), session);
    }
    return sessions;
  }, [audioHapticsSessions]);
  const selectedAudioHapticsSourceDisplayName = audioHapticsSessionByKey.get(audioReactiveHapticsSourceKey)?.displayName
    ?? audioHapticsSourceDisplayName(audioReactiveHapticsSource);
  const audioHapticsSourceOptions = useMemo<Array<[string, string]>>(() => {
    const options: Array<[string, string]> = [['System', 'system-audio']];
    for (const session of audioHapticsSessions) {
      options.push([session.displayName, audioHapticsSessionKey(session)]);
    }
    if (
      audioReactiveHapticsSourceKey !== 'system-audio'
      && !audioHapticsSessionByKey.has(audioReactiveHapticsSourceKey)
    ) {
      options.push([`${audioHapticsSourceDisplayName(audioReactiveHapticsSource)} unavailable`, audioReactiveHapticsSourceKey]);
    }
    return options;
  }, [
    audioHapticsSessionByKey,
    audioHapticsSessions,
    audioReactiveHapticsSource,
    audioReactiveHapticsSourceKey
  ]);
  const classicRumbleEnabled = Boolean(snapshot?.settings.classicRumbleEnabled);
  const classicRumbleV1Enabled = Boolean(snapshot?.settings.classicRumbleV1Enabled);
  const activeHapticsFeatureEnabled = showClassicRumbleControl ? classicRumbleEnabled : hapticsEnabled;
  const speakerEnabled = Boolean(snapshot?.settings.speakerEnabled);
  const speakerGainLevel = Math.max(1, Math.min(7, Math.round(
    snapshot?.settings.speakerGainLevel ?? snapshot?.status?.speakerGainLevel ?? 4
  )));
  const adaptiveTriggersEnabled = Boolean(snapshot?.settings.adaptiveTriggersEnabled);
  const lightbarEnabled = Boolean(snapshot?.settings.lightbarEnabled);
  const sleepKeybindEnabled = Boolean(snapshot?.settings.sleepKeybindEnabled);
  const controllerToastEnabled = Boolean(snapshot?.settings.notifyControllerConnection);
  const lowBatteryToastEnabled = Boolean(snapshot?.settings.notifyLowBattery);
  const notificationsEnabled = controllerToastEnabled || lowBatteryToastEnabled;
  const gameStreamActive = Boolean(snapshot?.status?.hostOutputRecent);
  const adaptiveTriggerOutputActive = Boolean(snapshot?.status?.adaptiveTriggerOutputRecent);
  const audioStatus = snapshot?.diagnostics.audioStatus;
  const headsetOutputDetected = Boolean(audioStatus?.headsetPlugged);
  const controllerPowerSavingActive = controllerPowerSavingActiveFromSnapshot(snapshot);
  const feedbackBoostEnabled = Boolean(snapshot?.settings.feedbackBoostEnabled);
  const hapticsSliderMax = feedbackSliderMaxFromSnapshot(snapshot);
  const hapticsSliderTicks = feedbackSliderTicks(hapticsSliderMax);
  const percentSliderMax = controllerPowerSavingActive ? CONTROLLER_POWER_SAVING_CAP_PERCENT : 100;
  const OutputIcon = headsetOutputDetected ? Headphones : Volume2;

  const outputControlLabel = headsetOutputDetected ? 'Headphones' : 'Speaker';
  const outputControlLower = headsetOutputDetected ? 'headphones' : 'speaker';
  const outputPresetLower = headsetOutputDetected ? 'headphones' : 'speaker';
  const duplexMicEnabled = Boolean(snapshot?.settings.duplexMicEnabled);
  const audioEnabled = speakerEnabled || duplexMicEnabled;
  const audioPathLabel = personaTransitionActive
    ? 'Switching Mode'
    : !connected
    ? 'Unavailable'
    : 'Bridge Local';
  const audioPathTooltip = personaTransitionActive
    ? 'Waiting for the controller to re-enumerate.'
    : audioPathLabel;
  const audioPathTone = connected && !personaTransitionActive ? 'good' : 'idle';
  const audioBufferLengthControlDisabled = !connected
    || !audioBufferLengthControlSupported
    || pendingAction !== null
    || audioBufferLengthCommitPending;
  const audioReactiveHapticsRouteSupported = audioReactiveHapticsSupported;
  const audioReactiveHapticsBlocked = !connected
    || !audioReactiveHapticsSupported
    || !audioReactiveHapticsRouteSupported
    || !hapticsEnabled;
  const audioReactiveHapticsControlDisabled = audioReactiveHapticsBlocked
    || pendingAction !== null
    || audioReactiveHapticsCommitPending;
  const audioReactiveHapticsConfigDisabled = audioReactiveHapticsControlDisabled || !audioReactiveHapticsEnabled;
  const audioReactiveHapticsStatusLabel = !connected
    ? 'Unavailable'
    : !audioReactiveHapticsSupported
      ? 'Update Firmware'
      : !hapticsEnabled
        ? 'HD Haptics Off'
        : audioReactiveHapticsEnabled
          ? 'Ready'
          : 'Off';
  const audioReactiveHapticsStatusTone = audioReactiveHapticsEnabled
    && hapticsEnabled
    && audioReactiveHapticsRouteSupported
    ? 'good'
    : connected && (
        !audioReactiveHapticsRouteSupported
        || !hapticsEnabled
      )
      ? 'warn'
      : 'idle';
  const audioReactiveHapticsOverrideMode = snapshot?.settings.audioReactiveHapticsMode === 'replace';
  const audioReactiveHapticsModeBadgeLabel = audioReactiveHapticsEnabled
    ? audioReactiveHapticsOverrideMode ? 'Override' : 'Mixed'
    : null;
  const audioReactiveHapticsModeTooltip = audioReactiveHapticsOverrideMode
    ? 'Audio haptics are replacing native haptic output.'
    : 'Audio haptics are mixed with native haptic output.';
  const duplexMicLabel = audioStatus?.duplexActive
    ? 'Duplex Active'
    : duplexMicEnabled
      ? 'Mic Standby'
      : 'Off';
  const speakerOutputMissing = false;
  const testHapticsUnavailable = !connected
    || !hapticsEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || testLocked
    || Boolean(snapshot?.status?.testHapticsBusy)
    || Boolean(snapshot?.status?.testHapticsCooldown);
  const testRumbleUnavailable = !connected
    || !classicRumbleEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || testLocked
    || Boolean(snapshot?.status?.testHapticsBusy);
  const hapticsStatusReady = connected
    && hapticsEnabled
    && !testLocked
    && !snapshot?.status?.testHapticsBusy
    && !snapshot?.status?.testHapticsCooldown;
  const rumbleStatusReady = connected
    && classicRumbleEnabled
    && !testLocked
    && !snapshot?.status?.testHapticsBusy;
  const hapticsStatusLabel = testLocked || snapshot?.status?.testHapticsBusy
    ? 'Testing'
      : snapshot?.status?.testHapticsCooldown
        ? 'Cooling Down'
      : hapticsStatusReady
        ? 'Ready'
        : 'Unavailable';
  const rumbleStatusLabel = testLocked
    ? 'Testing'
    : rumbleStatusReady
      ? 'Ready'
      : 'Unavailable';
  const hapticsStatusTone = testLocked || snapshot?.status?.testHapticsBusy || hapticsStatusReady
    ? 'good'
    : connected && snapshot?.status?.testHapticsCooldown
      ? 'warn'
      : 'idle';
  const rumbleStatusTone = testLocked || rumbleStatusReady
    ? 'good'
    : 'idle';
  const activeFeedbackTestUnavailable = showClassicRumbleControl ? testRumbleUnavailable : testHapticsUnavailable;
  const activeFeedbackStatusLabel = showClassicRumbleControl ? rumbleStatusLabel : hapticsStatusLabel;
  const activeFeedbackStatusTone = showClassicRumbleControl ? rumbleStatusTone : hapticsStatusTone;
  const testSpeakerUnavailable = !connected
    || !speakerVolumeSupported
    || !speakerEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || speakerTestLocked
    || gameStreamActive
    || Boolean(snapshot?.status?.testHapticsBusy);
  const testMicUnavailable = !connected
    || !duplexMicEnabled
    || pendingAction !== null
    || micVolumeCommitPending
    || lightbarCommitPending
    || micTestLocked
    || gameStreamActive;
  const speakerStatusReady = connected
    && speakerVolumeSupported
    && speakerEnabled
    && !speakerTestLocked
    && !speakerOutputMissing
    && !gameStreamActive
    && !snapshot?.status?.testHapticsBusy;
  const micStatusReady = connected
    && duplexMicEnabled
    && !micTestLocked
    && !gameStreamActive;
  const speakerStatusLabel = speakerTestLocked
    ? 'Playing'
    : connected && speakerTestError
      ? speakerTestError
    : connected && speakerOutputMissing
        ? BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE
        : speakerStatusReady
          ? 'Ready'
          : connected && gameStreamActive
            ? 'Game Audio Active'
            : 'Unavailable';
  const speakerStatusTone = speakerTestLocked || speakerStatusReady
    ? 'good'
    : connected && (speakerTestError || speakerOutputMissing)
        ? 'bad'
      : connected && gameStreamActive
        ? 'warn'
        : 'idle';
  const micTestStatusLabel = micTestLocked
    ? 'Listening'
    : connected && micTestError
      ? micTestError
      : micStatusReady
        ? 'Ready'
        : 'Unavailable';
  const micTestStatusTone = micTestLocked || micStatusReady
    ? 'good'
    : connected && micTestError
      ? 'bad'
      : 'idle';
  const activeAudioTestUnavailable = showMicrophoneControl ? testMicUnavailable : testSpeakerUnavailable;
  const activeAudioTestLocked = showMicrophoneControl ? micTestLocked : speakerTestLocked;
  const activeAudioTestStatusLabel = showMicrophoneControl ? micTestStatusLabel : speakerStatusLabel;
  const activeAudioTestStatusTone = showMicrophoneControl ? micTestStatusTone : speakerStatusTone;
  const sidebarDeviceTitle = personaTransitionActive
    ? 'Switching Mode'
    : connected && controllerConnected
    ? controllerName(snapshot.status?.controllerType)
    : 'Controller';
  const sidebarDeviceStatus = personaTransitionActive
    ? 'Please wait'
    : connected && controllerConnected
    ? 'Connected'
    : connected
      ? 'Controller not connected'
      : 'Bridge not detected';
  const sidebarDeviceTone = personaTransitionActive
    ? 'warn'
    : connected && controllerConnected
      ? 'good'
      : connected
        ? 'warn'
        : snapshot?.state === 'error' || snapshot?.state === 'incompatible'
          ? 'bad'
          : 'idle';
  const sidebarBatteryLabel = personaTransitionActive
    ? 'Reconnecting'
    : connected && controllerConnected
    ? `Battery ${batteryPercentLabel}`
    : 'Battery unavailable';
  const pollingRateLabel = POLLING_RATE_OPTIONS.find(([, mode]) => mode === snapshot?.settings.pollingRateMode)?.[0]
    .replace(' / Real-time', '')
    ?? '--';
  const firmwareUpdateAvailable = Boolean(snapshot?.diagnostics.firmwareUpdateAvailable);
  const overviewHealthLabel = healthLabel(snapshot);
  const overviewHealthTone = personaTransitionActive
    ? 'warn'
    : snapshot?.diagnostics.lastError
    ? 'bad'
    : firmwareUpdateAvailable
    ? 'warn'
    : connected && controllerConnected
      ? 'good'
      : connected
        ? 'warn'
        : 'idle';
  const systemHealthTone = personaTransitionActive
    ? 'warn'
    : snapshot?.diagnostics.lastError
      ? 'bad'
      : firmwareUpdateAvailable
        ? 'warn'
        : 'good';
  const overviewConnectionStatus = personaTransitionActive
    ? 'Switching'
    : connected && controllerConnected
    ? 'Stable'
    : connected
      ? 'Waiting'
      : 'Offline';
  const overviewAudioPathState = !connected
    ? '--'
    : 'Bridge Local';
  const overviewAudioPathDetail = personaTransitionActive
    ? 'Switching Mode'
    : !connected
    ? '--'
    : audioStatus?.controllerStateReady
      ? 'Controller Ready'
      : 'Waiting';
  const overviewAudioOutputLabel = connected ? (headsetOutputDetected ? 'Headphones' : 'Speaker') : '--';
  const overviewSpeakerVolumeValue = `${speakerVolumeValue}%`;
  const overviewFirmwareLabel = snapshot?.status?.firmwareVersion ?? '--';
  const overviewSignalValue = connected ? snapshot?.status?.signalStrengthDbm : null;
  const overviewSignalQuality = overviewSignalValue === null || overviewSignalValue === undefined
    ? null
    : overviewSignalValue >= -15
      ? 'Excellent'
      : overviewSignalValue >= -22
        ? 'Good'
        : overviewSignalValue >= -27
          ? 'Audio Risk'
          : 'Poor';
  const overviewSignalTone = overviewSignalQuality === 'Excellent' || overviewSignalQuality === 'Good'
    ? 'good'
    : overviewSignalQuality === 'Audio Risk'
      ? 'warn'
      : overviewSignalQuality === 'Poor'
        ? 'bad'
        : 'idle';
  const overviewSignalTitle = overviewSignalValue !== null && overviewSignalValue !== undefined
    ? `${overviewSignalValue} dBm`
    : undefined;
  const overviewSignalLabel = overviewSignalQuality
    ? overviewSignalQuality
    : '--';
  const overviewShortcutItems = [
    snapshot?.settings.sleepKeybindEnabled ? { id: 'sleep', label: 'Sleep Shortcut' } : null,
    snapshot?.settings.speakerVolumeShortcutEnabled ? { id: 'volume', label: 'Volume Shortcut' } : null
  ].filter((item): item is { id: 'sleep' | 'volume'; label: string } => Boolean(item));
  const overviewNotificationItems = [
    controllerToastEnabled ? { id: 'controller-status', label: 'Controller Status' } : null,
    lowBatteryToastEnabled ? { id: 'low-battery', label: 'Low Battery' } : null
  ].filter((item): item is { id: NotificationFocusTarget; label: string } => Boolean(item));
  const overviewPowerSavingLabel = snapshot?.settings.controllerPowerSavingEnabled
    ? controllerPowerSavingActive
      ? 'Active'
      : 'Enabled'
    : 'Off';
  const lightbarStateActive = connected && lightbarSupported && lightbarEnabled;
  const lightbarStateLabel = lightbarStateActive
    ? 'Active'
    : connected && lightbarSupported
      ? 'Off'
      : 'Unavailable';

  useEffect(() => {
    if (!connected || speakerOutputAvailable !== false || speakerTestLocked) {
      return undefined;
    }

    const refresh = () => {
      void findBridgeAudioOutputId(2).then((sinkId) => {
        if (!sinkId) {
          return;
        }
        setSpeakerOutputAvailable(true);
        setSpeakerTestError(null);
      });
    };

    const handle = window.setInterval(refresh, TEST_SPEAKER_ENDPOINT_REFRESH_MS);
    return () => window.clearInterval(handle);
  }, [connected, speakerOutputAvailable, speakerTestLocked]);

  useEffect(() => () => {
    stopMicLiveListen();
  }, []);

  useEffect(() => {
    if ((!connected || !showMicrophoneControl) && micTestLocked) {
      stopMicLiveListen();
    }
  }, [connected, showMicrophoneControl, micTestLocked]);

  const normalizedLightbarColor = normalizeHexColor(lightbarColor);
  const customSwatchColor = customLightbarColor ?? LIGHTBAR_DEFAULT_CUSTOM_COLOR;
  const customSwatchSelected = Boolean(customLightbarColor && normalizedLightbarColor === customLightbarColor);
  const customColorPickerDisabled = !connected || !lightbarSupported || !lightbarEnabled;
  const diagnosticsVisible = activeControlTab === 'system' && showDiagnostics;
  const ackText = useMemo(() => {
    if (!diagnosticsVisible) return '';
    if (!lastAck) return 'No commands yet';
    return `${ackResultName(lastAck.resultCode)} - seq ${lastAck.commandSequence}`;
  }, [diagnosticsVisible, lastAck]);
  const audioDebugText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    if (!snapshot) {
      return 'state=starting';
    }
    if (!snapshot.status) {
      return `state=${snapshot.state}\nmessage=${snapshot.message}`;
    }

    const debug = snapshot.status.audioDebug;
    const stats = snapshot.diagnostics.audioDebugStats;
    const audio = snapshot.diagnostics.audioStatus;
    const lines = [
      `state=${snapshot.state}`,
      `firmware=${snapshot.status.firmwareVersion}`,
      `triggerEffectIntensity=${snapshot.settings.triggerEffectIntensityPercent}%`,
      `classicRumble=${snapshot.settings.classicRumbleEnabled ? snapshot.settings.classicRumbleGainPercent : 0}%`,
      `appSpeakerSlider=${snapshot.settings.speakerVolumePercent}%`,
      `firmwareSpeakerGate=${snapshot.status.speakerVolumePercent}%`,
      `audioRecent=${snapshot.status.audioRecent ? 'true' : 'false'}`,
      `hostOutputRecent=${snapshot.status.hostOutputRecent ? 'true' : 'false'}`,
      `usbHostSpeakerVolume=${debug.usbHostSpeakerVolumePercent}%`,
      `usbHostSpeakerMute=${debug.usbHostSpeakerMute ? 'true' : 'false'}`,
      `usbHostMicVolume=${debug.usbHostMicVolumePercent}%`,
      `usbHostMicMute=${debug.usbHostMicMute ? 'true' : 'false'}`,
      `audioRepairCount=${debug.lastHostOutputCount}`,
      `lastAudioRepairReportId=0x${hexByte(debug.lastHostOutputReportId)}`,
      `lastAudioRepairLength=${debug.lastHostOutputLength}`
    ];
    if (audio) {
      lines.push(
        'audioPath=bridge-local',
        `controllerStateReady=${audio.controllerStateReady ? 'true' : 'false'}`,
        `headsetPlugged=${audio.headsetPlugged ? 'true' : 'false'}`,
        `headsetAudioRoute=${audio.headsetAudioRoute ? 'true' : 'false'}`,
        `duplexRequested=${audio.duplexRequested ? 'true' : 'false'}`,
        `duplexActive=${audio.duplexActive ? 'true' : 'false'}`,
        `micPacketsReceived=${audio.micPacketsReceived}`,
        `micPacketsDropped=${audio.micPacketsDropped}`,
        `micDecodeSuccess=${audio.micDecodeSuccess}`,
        `micDecodeFail=${audio.micDecodeFail}`,
        `micUsbWriteSuccess=${audio.micUsbWriteSuccess}`,
        `micUsbWriteShort=${audio.micUsbWriteShort}`,
        `micUsbConcealCount=${audio.micUsbConcealCount}`,
        `micPlcCount=${audio.micPlcCount}`,
        `micLastDecodedSamples=${audio.micLastDecodedSamples}`,
        `micLastWrittenBytes=${audio.micLastWrittenBytes}`,
        `micPeakPermille=${audio.micPeakPermille}`,
        `micUsbStreaming=${audio.micUsbStreaming ? 'true' : 'false'}`
      );
    }
    if (stats) {
      lines.push(
        `usbAudioGapMaxUs=${stats.usbAudioGapMaxUs}`,
        `usbAudioGapOver1500Count=${stats.usbAudioGapOver1500Count}`,
        `opusEncodeMaxUs=${stats.opusEncodeMaxUs}`,
        `opusEncodeOverBudgetCount=${stats.opusEncodeOverBudgetCount}`,
        `audio0x36EnqueueToSendMaxUs=${stats.audio0x36EnqueueToSendMaxUs}`,
        `audio0x36SendGapMaxUs=${stats.audio0x36SendGapMaxUs}`,
        `audio0x36LateCountOver12000Us=${stats.audio0x36LateCountOver12000Us}`,
        `audio0x36DropOldestCount=${stats.audio0x36DropOldestCount}`,
        `audioGenerationDropCount=${stats.audioGenerationDropCount}`,
        `nonAudioReportsBetweenAudioMax=${stats.nonAudioReportsBetweenAudioMax}`,
        `btAudioQueueDepthMax=${stats.btAudioQueueDepthMax}`,
        `audio0x36EnqueuedCount=${stats.audio0x36EnqueuedCount}`,
        `audio0x36SentCount=${stats.audio0x36SentCount}`,
        `criticalStarvingAudioCount=${stats.criticalStarvingAudioCount}`
      );
    }
    return lines.join('\n');
  }, [diagnosticsVisible, snapshot]);
  const audioEventLogText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    const lines = snapshot?.diagnostics.audioDebugLogLines ?? [];
    return lines.length > 0 ? lines.join('\n') : 'No audio debug events captured yet.';
  }, [diagnosticsVisible, snapshot?.diagnostics.audioDebugLogLines]);
  const triggerTraceText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    const lines = snapshot?.diagnostics.triggerTraceLines ?? [];
    return lines.length > 0 ? lines.join('\n') : 'No trigger trace events captured yet.';
  }, [diagnosticsVisible, snapshot?.diagnostics.triggerTraceLines]);
  const feedbackTraceText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    const lines = snapshot?.diagnostics.feedbackTraceLines ?? [];
    return lines.length > 0 ? lines.join('\n') : 'No non-zero feedback trace events captured yet.';
  }, [diagnosticsVisible, snapshot?.diagnostics.feedbackTraceLines]);

  async function runAction(label: string, action: () => Promise<BridgeSnapshot>) {
    if (!snapshot || pendingAction) {
      return;
    }
    setPendingAction(label);
    try {
      const next = await action();
      setSnapshot(next);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
    } finally {
      setPendingAction(null);
    }
  }

  async function runQuietAction(action: () => Promise<BridgeSnapshot>) {
    if (!snapshot) {
      return;
    }
    try {
      const next = await action();
      setSnapshot(next);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
    }
  }

  async function commitHapticsValue(value = hapticsValue) {
    const snappedValue = snapHapticsValue(value, hapticsSliderMax);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !snapshot.settings.hapticsEnabled
      || (controllerPowerSavingActive && snapshot.settings.hapticsGainPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT && snappedValue === CONTROLLER_POWER_SAVING_CAP_PERCENT)
      || snappedValue === snapshot.settings.hapticsGainPercent
      || hapticsCommitPending
    ) {
      hapticsEditingRef.current = false;
      return;
    }

    setHapticsCommitPending(true);
    hapticsEditingRef.current = true;
    try {
      const next = await window.bridge.setHapticsGain(snappedValue);
      setSnapshot(next);
      setHapticsValue(displayHapticsValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setHapticsValue(displayHapticsValue(next));
    } finally {
      setHapticsCommitPending(false);
      hapticsEditingRef.current = false;
    }
  }

  async function commitClassicRumbleValue(value = classicRumbleValue) {
    const snappedValue = snapHapticsValue(value, hapticsSliderMax);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !snapshot.settings.classicRumbleEnabled
      || (controllerPowerSavingActive && snapshot.settings.classicRumbleGainPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT && snappedValue === CONTROLLER_POWER_SAVING_CAP_PERCENT)
      || snappedValue === snapshot.settings.classicRumbleGainPercent
      || classicRumbleCommitPending
    ) {
      classicRumbleEditingRef.current = false;
      return;
    }

    setClassicRumbleCommitPending(true);
    classicRumbleEditingRef.current = true;
    try {
      const next = await window.bridge.setClassicRumbleGain(snappedValue);
      setSnapshot(next);
      setClassicRumbleValue(displayClassicRumbleValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setClassicRumbleValue(displayClassicRumbleValue(next));
    } finally {
      setClassicRumbleCommitPending(false);
      classicRumbleEditingRef.current = false;
    }
  }

  async function commitSpeakerVolume(value = speakerVolumeValue) {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !speakerVolumeSupported
      || !snapshot.settings.speakerEnabled
      || value === snapshot.settings.speakerVolumePercent
      || speakerVolumeCommitPending
    ) {
      speakerVolumeEditingRef.current = false;
      return;
    }

    setSpeakerVolumeCommitPending(true);
    speakerVolumeEditingRef.current = true;
    try {
      const next = await window.bridge.setSpeakerVolume(value);
      setSnapshot(next);
      setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
      await delay(TEST_SPEAKER_VOLUME_SETTLE_MS);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
    } finally {
      setSpeakerVolumeCommitPending(false);
      speakerVolumeEditingRef.current = false;
    }
  }

  async function commitLightbar(nextColor = lightbarColor, brightness = lightbarBrightnessValue) {
    const color = normalizeHexColor(nextColor);
    const snappedBrightness = snapLightbarBrightness(brightness);
    const shouldPreserveSavedBrightness = Boolean(
      snapshot
      && controllerPowerSavingActive
      && snapshot.settings.lightbarBrightnessPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT
      && snappedBrightness === CONTROLLER_POWER_SAVING_CAP_PERCENT
    );
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !lightbarSupported
      || !snapshot.settings.lightbarEnabled
      || lightbarCommitPending
      || (
        controllerPowerSavingActive
        && snapshot.settings.lightbarBrightnessPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT
        && snappedBrightness === CONTROLLER_POWER_SAVING_CAP_PERCENT
        && color === normalizeHexColor(snapshot.settings.lightbarColor)
      )
      || (
        color === normalizeHexColor(snapshot.settings.lightbarColor)
        && snappedBrightness === snapshot.settings.lightbarBrightnessPercent
      )
    ) {
      lightbarBrightnessEditingRef.current = false;
      return;
    }

    setLightbarCommitPending(true);
    try {
      const persistedBrightness = shouldPreserveSavedBrightness
        ? snapshot.settings.lightbarBrightnessPercent
        : snappedBrightness;
      const next = await window.bridge.setLightbarColor(color, persistedBrightness);
      setSnapshot(next);
      setLightbarBrightnessValue(displayLightbarBrightnessValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setLightbarBrightnessValue(displayLightbarBrightnessValue(next));
    } finally {
      setLightbarCommitPending(false);
      lightbarBrightnessEditingRef.current = false;
    }
  }

  async function commitTriggerEffectIntensity(value = triggerEffectIntensityValue) {
    const snappedValue = snapTriggerEffectIntensity(value);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !adaptiveTriggersSupported
      || !snapshot.settings.adaptiveTriggersEnabled
      || (controllerPowerSavingActive && snapshot.settings.triggerEffectIntensityPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT && snappedValue === CONTROLLER_POWER_SAVING_CAP_PERCENT)
      || snappedValue === snapshot.settings.triggerEffectIntensityPercent
    ) {
      triggerEffectEditingRef.current = false;
      return;
    }

    try {
      const next = await window.bridge.setTriggerEffectIntensity(snappedValue);
      setSnapshot(next);
      setTriggerEffectIntensityValue(displayTriggerEffectIntensityValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setTriggerEffectIntensityValue(displayTriggerEffectIntensityValue(next));
    } finally {
      triggerEffectEditingRef.current = false;
    }
  }

  function selectLightbarColor(nextColor: string) {
    const color = normalizeHexColor(nextColor);
    setLightbarColor(color);
    void commitLightbar(color, lightbarBrightnessValue);
  }

  function saveCustomLightbarColor(nextColor: string) {
    const color = normalizeHexColor(nextColor);
    setCustomLightbarColor(color);
    setCustomColorDraft(color);
    setLightbarColor(color);
    setShowCustomColorPicker(false);
    setCustomSwatchPrimed(false);
    window.localStorage.setItem('ds5bridge.customLightbarColor', color);
    void commitLightbar(color, lightbarBrightnessValue);
  }

  function previewCustomLightbarColor(nextColor: string) {
    const color = normalizeHexColor(nextColor);
    setCustomColorDraft(color);
    setLightbarColor(color);
    void commitLightbar(color, lightbarBrightnessValue);
  }

  function selectCustomLightbarColor() {
    if (!customLightbarColor) {
      setCustomSwatchPrimed(true);
      if (customSwatchPrimeTimerRef.current !== null) {
        window.clearTimeout(customSwatchPrimeTimerRef.current);
      }
      customSwatchPrimeTimerRef.current = window.setTimeout(() => {
        setCustomSwatchPrimed(false);
        customSwatchPrimeTimerRef.current = null;
      }, 1600);
      return;
    }
    selectLightbarColor(customLightbarColor);
  }

  function openCustomLightbarPicker() {
    const color = customLightbarColor ?? LIGHTBAR_DEFAULT_CUSTOM_COLOR;
    setCustomColorDraft(color);
    setCustomSwatchPrimed(false);
    setShowCustomColorPicker(true);
  }

  function setLightbarPreset(value: number) {
    const brightness = snapLightbarBrightness(capControllerPowerSavingValue(value, snapshot));
    setLightbarBrightnessValue(brightness);
    void commitLightbar(lightbarColor, brightness);
  }

  function setHapticsPreset(value: number) {
    const snappedValue = snapHapticsValue(capControllerPowerSavingValue(value, snapshot), hapticsSliderMax);
    hapticsEditingRef.current = true;
    setHapticsValue(snappedValue);
    void commitHapticsValue(snappedValue);
  }

  function setClassicRumblePreset(value: number) {
    const snappedValue = snapHapticsValue(capControllerPowerSavingValue(value, snapshot), hapticsSliderMax);
    classicRumbleEditingRef.current = true;
    setClassicRumbleValue(snappedValue);
    void commitClassicRumbleValue(snappedValue);
  }

  function setSpeakerPreset(value: number) {
    const snappedValue = snapSpeakerVolume(value);
    speakerVolumeEditingRef.current = true;
    setSpeakerVolumeValue(snappedValue);
    void commitSpeakerVolume(snappedValue);
  }

  function setSpeakerGainLevel(level: number) {
    if (!snapshot) {
      return;
    }
    const value = Math.max(1, Math.min(7, Math.round(level)));
    if (value === snapshot.settings.speakerGainLevel) {
      return;
    }
    void runQuietAction(() => window.bridge.setSpeakerGainLevel(value));
  }

  async function commitMicVolume(value = micVolumeValue) {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || value === snapshot.settings.micVolumePercent
      || micVolumeCommitPending
    ) {
      micVolumeEditingRef.current = false;
      return;
    }

    setMicVolumeCommitPending(true);
    micVolumeEditingRef.current = true;
    try {
      const next = await window.bridge.setMicVolume(value);
      setSnapshot(next);
      setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
    } finally {
      setMicVolumeCommitPending(false);
      micVolumeEditingRef.current = false;
    }
  }

  function setMicPreset(value: number) {
    const snappedValue = snapMicVolume(value);
    micVolumeEditingRef.current = true;
    setMicVolumeValue(snappedValue);
    void commitMicVolume(snappedValue);
  }

  async function commitAudioBufferLength(value = audioBufferLengthValue) {
    const snappedValue = clampAudioBufferLength(value);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !audioBufferLengthControlSupported
      || snappedValue === snapshot.settings.hapticsBufferLength
      || audioBufferLengthCommitPending
    ) {
      audioBufferLengthEditingRef.current = false;
      setAudioBufferLengthValue(snappedValue);
      return;
    }

    setAudioBufferLengthCommitPending(true);
    audioBufferLengthEditingRef.current = true;
    try {
      const next = await window.bridge.setHapticsBufferLength(snappedValue);
      setSnapshot(next);
      setAudioBufferLengthValue(clampAudioBufferLength(next.settings.hapticsBufferLength));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setAudioBufferLengthValue(clampAudioBufferLength(next.settings.hapticsBufferLength));
    } finally {
      setAudioBufferLengthCommitPending(false);
      audioBufferLengthEditingRef.current = false;
    }
  }

  async function commitAudioReactiveHapticsConfig(config: Partial<AudioReactiveHapticsConfig>): Promise<BridgeSnapshot | null> {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !audioReactiveHapticsSupported
      || !hapticsEnabled
      || audioReactiveHapticsCommitPending
    ) {
      return null;
    }

    setAudioReactiveHapticsCommitPending(true);
    try {
      const next = await window.bridge.setAudioReactiveHapticsConfig(config);
      applySnapshot(next);
      return next;
    } catch {
      const next = await window.bridge.getStatus();
      applySnapshot(next);
      return next;
    } finally {
      setAudioReactiveHapticsCommitPending(false);
    }
  }

  function toggleAudioReactiveHapticsEnabled() {
    if (!snapshot) return;
    void commitAudioReactiveHapticsConfig({
      enabled: !snapshot.settings.audioReactiveHapticsEnabled
    });
  }

  function toggleAudioHapticsFeature() {
    if (!snapshot) return;
    const nextEnabled = !audioReactiveHapticsEnabled;
    // The header switch owns both the feature state and the panel visibility:
    // on -> enable + reveal the panel, off -> disable + collapse it.
    setAudioHapticsOpen(nextEnabled);
    void commitAudioReactiveHapticsConfig({ enabled: nextEnabled });
  }

  function setAudioReactiveHapticsMode(mode: AudioReactiveHapticsMode) {
    if (!snapshot || mode === snapshot.settings.audioReactiveHapticsMode) return;
    void commitAudioReactiveHapticsConfig({ mode });
  }

  function setAudioReactiveHapticsSourceValue(value: string) {
    if (!snapshot || value === audioReactiveHapticsSourceKey) return;
    if (value === 'system-audio') {
      void commitAudioReactiveHapticsConfig({ source: 'system-audio' });
      return;
    }
    const session = audioHapticsSessionByKey.get(value);
    if (!session) {
      return;
    }
    void commitAudioReactiveHapticsConfig({ source: audioHapticsSourceFromSession(session) });
  }

  function setAudioReactiveHapticsBassFocus(bassFocus: AudioReactiveHapticsBassFocus) {
    if (!snapshot || bassFocus === snapshot.settings.audioReactiveHapticsBassFocus) return;
    void commitAudioReactiveHapticsConfig({ bassFocus });
  }

  function setAudioReactiveHapticsResponse(response: AudioReactiveHapticsResponse) {
    if (!snapshot || response === snapshot.settings.audioReactiveHapticsResponse) return;
    void commitAudioReactiveHapticsConfig({ response });
  }

  function setAudioReactiveHapticsAttack(attack: AudioReactiveHapticsAttack) {
    if (!snapshot || attack === snapshot.settings.audioReactiveHapticsAttack) return;
    void commitAudioReactiveHapticsConfig({ attack });
  }

  function setAudioReactiveHapticsRelease(release: AudioReactiveHapticsRelease) {
    if (!snapshot || release === snapshot.settings.audioReactiveHapticsRelease) return;
    void commitAudioReactiveHapticsConfig({ release });
  }

  function setTriggerIntensityPreset(value: number) {
    const snappedValue = snapTriggerEffectIntensity(capControllerPowerSavingValue(value, snapshot));
    setTriggerEffectIntensityValue(snappedValue);
    void commitTriggerEffectIntensity(snappedValue);
  }

  function lightbarColorName(color: string) {
    const normalized = normalizeHexColor(color);
    return LIGHTBAR_COLOR_NAMES[normalized] ?? 'Custom';
  }

  function isPreservingPowerSavingCap(savedValue: number, visibleValue: number): boolean {
    return controllerPowerSavingActive
      && savedValue > CONTROLLER_POWER_SAVING_CAP_PERCENT
      && visibleValue === CONTROLLER_POWER_SAVING_CAP_PERCENT;
  }

  function runFeedbackTest() {
    setTestLocked(true);
    void runAction(showClassicRumbleControl ? 'test-rumble' : 'test', async () => {
      if (snapshot && showClassicRumbleControl) {
        if (
          classicRumbleValue !== snapshot.settings.classicRumbleGainPercent
          && !isPreservingPowerSavingCap(snapshot.settings.classicRumbleGainPercent, classicRumbleValue)
        ) {
          await window.bridge.setClassicRumbleGain(classicRumbleValue);
        }
        return window.bridge.testClassicRumble();
      }
      if (
        snapshot
        && hapticsValue !== snapshot.settings.hapticsGainPercent
        && !isPreservingPowerSavingCap(snapshot.settings.hapticsGainPercent, hapticsValue)
      ) {
        await window.bridge.setHapticsGain(hapticsValue);
      }
      return window.bridge.testHaptics();
    }).finally(() => {
      window.setTimeout(() => setTestLocked(false), TEST_HAPTICS_LOCK_MS);
    });
  }

  function runTestSpeaker() {
    setSpeakerTestLocked(true);
    setPendingAction('speaker');
    setSpeakerTestError(null);
    void (async () => {
      try {
        let volumeChanged = false;
        if (snapshot && speakerVolumeSupported && speakerVolumeValue !== snapshot.settings.speakerVolumePercent) {
          speakerVolumeEditingRef.current = true;
          const next = await window.bridge.setSpeakerVolume(speakerVolumeValue);
          setSnapshot(next);
          setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
          speakerVolumeEditingRef.current = false;
          volumeChanged = true;
        }
        if (volumeChanged) {
          await delay(TEST_SPEAKER_VOLUME_SETTLE_MS);
        }
        const next = await window.bridge.testSpeaker();
        setSnapshot(next);
        setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
        setSpeakerOutputAvailable(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE;
        setSpeakerTestError(message);
        setSpeakerOutputAvailable(true);
        const next = await window.bridge.getStatus();
        setSnapshot(next);
        setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
        speakerVolumeEditingRef.current = false;
      } finally {
        speakerVolumeEditingRef.current = false;
        setPendingAction(null);
        window.setTimeout(() => setSpeakerTestLocked(false), TEST_SPEAKER_LOCK_MS);
      }
    })();
  }

  function runTestMic() {
    setMicTestLocked(true);
    setPendingAction('mic-test');
    setMicTestError(null);
    void (async () => {
      try {
        if (snapshot && micVolumeValue !== snapshot.settings.micVolumePercent) {
          micVolumeEditingRef.current = true;
          const next = await window.bridge.setMicVolume(micVolumeValue);
          setSnapshot(next);
          setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
          micVolumeEditingRef.current = false;
        }
        await playMicLiveListen(TEST_MIC_LISTEN_MS);
      } catch (error) {
        const message = error instanceof Error ? error.message : BRIDGE_MIC_ENDPOINT_UNAVAILABLE;
        setMicTestError(message);
        const next = await window.bridge.getStatus();
        setSnapshot(next);
        setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
      } finally {
        micVolumeEditingRef.current = false;
        setPendingAction(null);
        setMicTestLocked(false);
      }
    })();
  }

  function resetAdaptiveTriggers() {
    void runAction('triggers-reset', () => window.bridge.resetAdaptiveTriggers());
  }

  function selectControllerProfile(profileId: string) {
    void runAction('controller-profile', () => window.bridge.selectControllerProfile(profileId));
  }

  function renameControllerProfile() {
    // Game-owned profiles take their name from the game; rename the game instead.
    if (!selectedControllerProfile || selectedControllerProfileIsDefault || selectedControllerProfileIsGameOwned) {
      return;
    }
    setControllerProfileNameDraft(selectedControllerProfile.name);
    setControllerProfileDialogMode('rename');
  }

  function saveControllerProfile() {
    setControllerProfileNameDraft(`Custom Profile ${snapshot?.settings.controllerProfiles.length ?? 1}`);
    setControllerProfileDialogMode('save');
  }

  function deleteControllerProfile() {
    if (!selectedControllerProfile || !canDeleteControllerProfile) {
      return;
    }
    setControllerProfileDialogMode('delete');
  }

  function closeControllerProfileDialog() {
    setControllerProfileDialogMode(null);
    setControllerProfileNameDraft('');
  }

  function submitControllerProfileDialog() {
    if (!selectedControllerProfile && controllerProfileDialogMode !== 'save') {
      return;
    }
    if (controllerProfileDialogMode === 'save') {
      const nextName = controllerProfileNameDraft.trim();
      if (!nextName) {
        return;
      }
      closeControllerProfileDialog();
      void runAction('controller-save-profile', () => window.bridge.saveControllerProfile(nextName));
      return;
    }
    if (controllerProfileDialogMode === 'rename' && selectedControllerProfile && !selectedControllerProfileIsDefault) {
      const nextName = controllerProfileNameDraft.trim();
      if (!nextName || nextName === selectedControllerProfile.name) {
        closeControllerProfileDialog();
        return;
      }
      closeControllerProfileDialog();
      void runAction('controller-rename-profile', () => (
        window.bridge.renameControllerProfile(selectedControllerProfile.id, nextName)
      ));
      return;
    }
    if (controllerProfileDialogMode === 'delete' && selectedControllerProfile && canDeleteControllerProfile) {
      closeControllerProfileDialog();
      void runAction('controller-delete-profile', () => (
        window.bridge.deleteControllerProfile(selectedControllerProfile.id)
      ));
    }
  }

  function selectButtonRemappingProfile(profileId: string) {
    void runAction('remap-profile', () => window.bridge.selectButtonRemappingProfile(profileId));
  }

  function setButtonRemap(buttonId: RemapButtonId, targetId: RemapButtonId) {
    setRemapDraft((draft) => ({ ...draft, [buttonId]: targetId }));
    void runAction(`remap-${buttonId}`, () => window.bridge.setButtonRemap(buttonId, targetId));
  }

  function restoreButtonRemappingDefaults() {
    void runAction('remap-restore', () => window.bridge.restoreButtonRemappingDefaults());
  }

  function renameButtonRemappingProfile() {
    if (!selectedRemapProfile || selectedRemapProfileIsDefault || selectedRemapProfileIsGameOwned) {
      return;
    }
    setRemapProfileNameDraft(selectedRemapProfile.name);
    setRemapProfileDialogMode('rename');
  }

  function saveButtonRemappingProfile() {
    setRemapProfileNameDraft(`Custom Profile ${snapshot?.settings.buttonRemappingProfiles.length ?? 1}`);
    setRemapProfileDialogMode('save');
  }

  function deleteButtonRemappingProfile() {
    // Game-owned mappings are deleted with their game profile, not from here.
    if (!selectedRemapProfile || selectedRemapProfileIsDefault || selectedRemapProfileIsGameOwned) {
      return;
    }
    setRemapProfileDialogMode('delete');
  }

  function closeRemapProfileDialog() {
    setRemapProfileDialogMode(null);
    setRemapProfileNameDraft('');
  }

  function submitRemapProfileDialog() {
    if (!selectedRemapProfile && remapProfileDialogMode !== 'save') {
      return;
    }
    if (remapProfileDialogMode === 'save') {
      const nextName = remapProfileNameDraft.trim();
      if (!nextName) {
        return;
      }
      closeRemapProfileDialog();
      void runAction('remap-save-profile', () => window.bridge.saveButtonRemappingProfile(nextName));
      return;
    }
    if (remapProfileDialogMode === 'rename' && selectedRemapProfile && !selectedRemapProfileIsDefault) {
      const nextName = remapProfileNameDraft.trim();
      if (!nextName || nextName === selectedRemapProfile.name) {
        closeRemapProfileDialog();
        return;
      }
      closeRemapProfileDialog();
      void runAction('remap-rename-profile', () => (
        window.bridge.renameButtonRemappingProfile(selectedRemapProfile.id, nextName)
      ));
      return;
    }
    if (remapProfileDialogMode === 'delete' && selectedRemapProfile && !selectedRemapProfileIsDefault) {
      closeRemapProfileDialog();
      void runAction('remap-delete-profile', () => window.bridge.deleteButtonRemappingProfile(selectedRemapProfile.id));
    }
  }

  function commitChordConfiguration(
    nextFunctions: ChordFunction[],
    nextAssignments: ChordAssignment[],
    _action = 'chords-save'
  ) {
    void runQuietAction(() => window.bridge.setChordConfiguration(nextFunctions, nextAssignments));
  }

  function createChordFunction() {
    const id = `function-${Date.now().toString(36)}`;
    const nextDraft: ChordFunctionDraft = {
      ...EMPTY_CHORD_FUNCTION_DRAFT,
      id,
      name: `Function ${chordFunctions.length + 1}`
    };
    const nextFunction = chordFunctionFromDraft(nextDraft);
    setSelectedChordFunctionId(id);
    setChordFunctionDraft(chordFunctionToDraft(nextFunction));
    commitChordConfiguration([...chordFunctions, nextFunction], chordAssignments, 'chords-create-function');
  }

  function commitChordFunctionDraft(nextDraft = chordFunctionDraft) {
    const nextFunction = chordFunctionFromDraft(nextDraft);
    const exists = chordFunctions.some((func) => func.id === nextFunction.id);
    const nextFunctions = exists
      ? chordFunctions.map((func) => (func.id === nextFunction.id ? nextFunction : func))
      : [...chordFunctions, nextFunction];
    setSelectedChordFunctionId(nextFunction.id);
    commitChordConfiguration(nextFunctions, chordAssignments, `chords-function-${nextFunction.id}`);
  }

  function setChordFunctionKeyboardKey(keyboardKey: string) {
    const nextDraft = { ...chordFunctionDraft, keyboardKey };
    setChordFunctionDraft(nextDraft);
    commitChordFunctionDraft(nextDraft);
  }

  function toggleChordFunctionKeyboardModifier(modifier: ChordKeyboardModifier) {
    const enabled = chordFunctionDraft.keyboardModifiers.includes(modifier);
    if (!enabled && chordFunctionDraft.keyboardModifiers.length >= MAX_KEYBOARD_FUNCTION_KEYS - 1) {
      return;
    }
    const keyboardModifiers = enabled
      ? chordFunctionDraft.keyboardModifiers.filter((candidate) => candidate !== modifier)
      : CHORD_KEYBOARD_MODIFIER_OPTIONS
        .map(([, candidate]) => candidate)
        .filter((candidate) => (
          candidate === modifier || chordFunctionDraft.keyboardModifiers.includes(candidate)
        ));
    const nextDraft = { ...chordFunctionDraft, keyboardModifiers };
    setChordFunctionDraft(nextDraft);
    commitChordFunctionDraft(nextDraft);
  }

  function setChordFunctionControllerAction(action: ChordControllerSettingAction) {
    const nextDraft = { ...chordFunctionDraft, controllerAction: action };
    setChordFunctionDraft(nextDraft);
    commitChordFunctionDraft(nextDraft);
  }

  function setChordFunctionControllerStepPercent(stepPercent: number) {
    const nextDraft = {
      ...chordFunctionDraft,
      controllerStepPercent: normalizeChordControllerSettingStepPercent(stepPercent)
    };
    setChordFunctionDraft(nextDraft);
    commitChordFunctionDraft(nextDraft);
  }

  function renderChordFunctionSummary(func: ChordFunction) {
    const notchTarget = func.type === 'controller-setting'
      ? chordNotchTargetForAction(func.action)
      : null;
    const detailLabel = func.type === 'keyboard'
      ? 'Keys'
      : notchTarget
        ? 'Adjustment'
        : 'Action';
    const detailValue = func.type === 'controller-setting' && notchTarget
      ? chordControllerSettingAdjustmentText(func.action)
      : chordFunctionSummary(func);

    return (
      <div className="chords-function-summary chords-function-summary-grouped">
        <div className="chords-function-summary-header">
          <span>Summary</span>
          {func.type === 'controller-setting' && notchTarget ? (
            <div className="chords-function-summary-options">
              <label className="chords-step-selector">
                <span>Step</span>
                <input
                  type="number"
                  min={CHORD_CONTROLLER_SETTING_STEP_MIN}
                  max={CHORD_CONTROLLER_SETTING_STEP_MAX}
                  step={1}
                  value={chordFunctionDraft.id === func.id ? chordFunctionDraft.controllerStepPercent : func.stepPercent}
                  disabled={pendingAction !== null}
                  aria-label={`${notchTarget.target.label} step percent`}
                  onChange={(event) => {
                    const nextValue = normalizeChordControllerSettingStepPercent(event.target.value);
                    setChordFunctionDraft((draft) => ({ ...draft, controllerStepPercent: nextValue }));
                  }}
                  onBlur={(event) => {
                    setChordFunctionControllerStepPercent(Number(event.currentTarget.value));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                />
                <small>%</small>
              </label>
              <div className="dual-selector chords-notch-direction-selector" role="group" aria-label={`${notchTarget.target.label} direction`}>
                <button
                  type="button"
                  className={notchTarget.direction === 'down' ? 'active' : ''}
                  title={`Decrease ${notchTarget.target.label}`}
                  aria-label={`Decrease ${notchTarget.target.label}`}
                  disabled={pendingAction !== null}
                  onClick={() => setChordFunctionControllerAction(notchTarget.target.downAction)}
                >
                  <Minus size={15} />
                </button>
                <button
                  type="button"
                  className={notchTarget.direction === 'up' ? 'active' : ''}
                  title={`Increase ${notchTarget.target.label}`}
                  aria-label={`Increase ${notchTarget.target.label}`}
                  disabled={pendingAction !== null}
                  onClick={() => setChordFunctionControllerAction(notchTarget.target.upAction)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="chords-function-summary-detail">
          <div className="chords-function-summary-detail-row">
            <span>Type</span>
            <strong>{chordFunctionTypeLabel(func.type)}</strong>
          </div>
          <div className="chords-function-summary-detail-row">
            <span>{detailLabel}</span>
            <strong>
              {detailValue}
              {func.type === 'controller-setting' && notchTarget ? (
                <em> — {func.stepPercent}% step</em>
              ) : null}
            </strong>
          </div>
        </div>
      </div>
    );
  }

  function openChordFunctionDialog(mode: ChordFunctionDialogMode) {
    if (!selectedChordFunction) {
      return;
    }
    setChordFunctionNameDraft(selectedChordFunction.name);
    setChordFunctionDialog({ mode, functionId: selectedChordFunction.id });
  }

  function closeChordFunctionDialog() {
    setChordFunctionDialog(null);
    setChordFunctionNameDraft('');
  }

  function deleteChordFunction(functionId: string) {
    const nextFunctions = chordFunctions.filter((func) => func.id !== functionId);
    const nextAssignments = chordAssignments.filter((assignment) => assignment.functionId !== functionId);
    const nextSelected = nextFunctions[0] ?? null;
    setSelectedChordFunctionId(nextSelected?.id ?? '');
    setChordFunctionDraft(chordFunctionToDraft(nextSelected));
    setChordAssignmentDraftRows((rows) => rows.filter((row) => row.functionId !== functionId));
    commitChordConfiguration(nextFunctions, nextAssignments, `chords-delete-function-${functionId}`);
  }

  function submitChordFunctionDialog() {
    if (!chordFunctionDialog) {
      return;
    }
    const current = chordFunctions.find((func) => func.id === chordFunctionDialog.functionId);
    if (!current) {
      closeChordFunctionDialog();
      return;
    }
    if (chordFunctionDialog.mode === 'delete') {
      deleteChordFunction(current.id);
      closeChordFunctionDialog();
      return;
    }
    const nextName = chordFunctionNameDraft.trim().slice(0, MAX_CHORD_FUNCTION_NAME_LENGTH);
    if (!nextName || nextName === current.name) {
      closeChordFunctionDialog();
      return;
    }
    const nextFunction = { ...current, name: nextName };
    const nextFunctions = chordFunctions.map((func) => (func.id === current.id ? nextFunction : func));
    setSelectedChordFunctionId(current.id);
    setChordFunctionDraft(chordFunctionToDraft(nextFunction));
    commitChordConfiguration(nextFunctions, chordAssignments, `chords-rename-function-${current.id}`);
    closeChordFunctionDialog();
  }

  function commitChordAssignment(nextAssignment: ChordAssignment, replaceAssignmentId?: string) {
    const replacingExisting = replaceAssignmentId
      ? chordAssignments.some((assignment) => assignment.id === replaceAssignmentId)
      : false;
    if (!replacingExisting && chordAssignments.length >= MAX_CHORD_ASSIGNMENTS) {
      return;
    }
    const nextAssignments = replacingExisting
      ? chordAssignments.map((assignment) => (
        assignment.id === replaceAssignmentId ? nextAssignment : assignment
      ))
      : [...chordAssignments, nextAssignment];
    commitChordConfiguration(chordFunctions, nextAssignments, `chords-assignment-${nextAssignment.id}`);
  }

  function addChordAssignmentDraft() {
    if (!canAddChordDraft) {
      return;
    }
    setChordAssignmentDraftRows((rows) => [
      ...rows,
      {
        id: `draft-${Date.now().toString(36)}-${rows.length}`,
        starter: chordStarterOptions[0]?.[1] ?? 'ps',
        button: null,
        functionId: defaultChordFunctionId
      }
    ]);
  }

  function commitChordAssignmentDraft(row: ChordAssignmentDraftRow, button: ChordAssignableButtonId) {
    if (!row.functionId || !isChordBindingAllowed(row.starter, button)) {
      return;
    }
    const nextAssignment: ChordAssignment = {
      id: createChordAssignmentId(row.starter, button),
      kind: 'chord',
      starter: row.starter,
      button,
      functionId: row.functionId
    };
    setChordAssignmentDraftRows((rows) => rows.filter((draft) => draft.id !== row.id));
    commitChordAssignment(nextAssignment);
  }

  function updateChordAssignmentDraftStarter(rowId: string, starter: ChordStarterId) {
    setChordAssignmentDraftRows((rows) => rows.map((row) => (
      row.id === rowId
        ? {
          ...row,
          starter,
          button: row.button && isChordBindingAllowed(starter, row.button) ? row.button : null
        }
        : row
    )));
  }

  function updateChordAssignmentDraftButton(rowId: string, button: ChordButtonSelectValue) {
    if (button === CHORD_UNASSIGNED_BUTTON) {
      return;
    }
    const row = chordAssignmentDraftRows.find((draft) => draft.id === rowId);
    if (row) {
      commitChordAssignmentDraft(row, button);
    }
  }

  function updateChordAssignmentDraftFunction(rowId: string, functionId: string) {
    setChordAssignmentDraftRows((rows) => rows.map((row) => (
      row.id === rowId ? { ...row, functionId } : row
    )));
  }

  function deleteChordAssignmentDraft(rowId: string) {
    setChordAssignmentDraftRows((rows) => rows.filter((row) => row.id !== rowId));
  }

  function updateChordAssignmentStarter(assignmentId: string, starter: ChordStarterId) {
    const current = chordAssignments.find((assignment) => assignment.id === assignmentId);
    if (!current) {
      return;
    }
    const button = isChordBindingAllowed(starter, current.button)
      ? current.button
      : firstAllowedChordButton(starter);
    if (!button) {
      return;
    }
    commitChordAssignment({
      ...current,
      starter,
      button
    }, assignmentId);
  }

  function updateChordAssignmentButton(assignmentId: string, button: ChordButtonSelectValue) {
    if (button === CHORD_UNASSIGNED_BUTTON) {
      return;
    }
    const current = chordAssignments.find((assignment) => assignment.id === assignmentId);
    if (!current || !isChordBindingAllowed(current.starter, button)) {
      return;
    }
    commitChordAssignment({
      ...current,
      button
    }, assignmentId);
  }

  function setChordAssignmentFunction(assignmentId: string, functionId: string) {
    const current = chordAssignments.find((assignment) => assignment.id === assignmentId);
    if (!current) {
      return;
    }
    commitChordAssignment({
      ...current,
      functionId
    }, assignmentId);
  }

  function deleteChordAssignment(assignmentId: string) {
    const nextAssignments = chordAssignments.filter((assignment) => assignment.id !== assignmentId);
    commitChordConfiguration(chordFunctions, nextAssignments, `chords-delete-assignment-${assignmentId}`);
  }

  function updateChordAssignmentScrollbar() {
    const list = chordAssignmentListRef.current;
    if (!list) {
      return;
    }
    const maxScroll = list.scrollHeight - list.clientHeight;
    if (maxScroll <= 1) {
      setChordAssignmentScrollbar((current) => (
        current.visible ? { visible: false, top: 0, height: 0 } : current
      ));
      return;
    }
    const trackHeight = list.clientHeight;
    const height = Math.max(30, Math.round((list.clientHeight / list.scrollHeight) * trackHeight));
    const top = Math.round((list.scrollTop / maxScroll) * (trackHeight - height));
    setChordAssignmentScrollbar((current) => (
      current.visible && current.top === top && current.height === height
        ? current
        : { visible: true, top, height }
    ));
  }

  function startChordAssignmentScrollbarDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const list = chordAssignmentListRef.current;
    if (!list || !chordAssignmentScrollbar.visible || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startScrollTop = list.scrollTop;
    const maxScroll = list.scrollHeight - list.clientHeight;
    const thumbTravel = list.clientHeight - chordAssignmentScrollbar.height;
    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      list.scrollTop = startScrollTop + ((moveEvent.clientY - startY) / thumbTravel) * maxScroll;
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function reorderChordAssignment(sourceId: string, targetId: string, placement: 'before' | 'after') {
    if (sourceId === targetId) {
      return;
    }
    const sourceIndex = chordAssignments.findIndex((assignment) => assignment.id === sourceId);
    if (sourceIndex === -1 || !chordAssignments.some((assignment) => assignment.id === targetId)) {
      return;
    }
    const nextAssignments = [...chordAssignments];
    const [moved] = nextAssignments.splice(sourceIndex, 1);
    if (!moved) {
      return;
    }
    const targetIndex = nextAssignments.findIndex((assignment) => assignment.id === targetId);
    if (targetIndex === -1) {
      return;
    }
    nextAssignments.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, moved);
    commitChordConfiguration(chordFunctions, nextAssignments, `chords-reorder-assignment-${sourceId}`);
  }

  function setChordAssignmentDragDropHint(nextHint: ChordAssignmentDropHint | null) {
    const session = chordAssignmentDragRef.current;
    if (session) {
      session.dropHint = nextHint;
    }
    setChordAssignmentDropHint((current) => (
      current?.targetId === nextHint?.targetId && current?.placement === nextHint?.placement
        ? current
        : nextHint
    ));
  }

  function createChordAssignmentDragOverlay(sourceRow: HTMLDivElement): HTMLElement {
    const overlay = sourceRow.cloneNode(true) as HTMLElement;
    const rect = sourceRow.getBoundingClientRect();
    overlay.classList.add('chords-assignment-drag-overlay');
    overlay.classList.remove('dragging', 'drop-before', 'drop-after');
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    (sourceRow.closest<HTMLElement>('.shell') ?? document.body).appendChild(overlay);
    return overlay;
  }

  function moveChordAssignmentDragOverlay(session: ChordAssignmentDragSession, clientX: number, clientY: number) {
    if (!session.overlay) {
      return;
    }
    session.overlay.style.transform = `translate3d(${clientX - session.offsetX}px, ${clientY - session.offsetY}px, 0) scale(1.01)`;
  }

  function updateChordAssignmentDropTarget(sourceId: string, _clientX: number, clientY: number) {
    const list = chordAssignmentListRef.current;
    if (!list) {
      setChordAssignmentDragDropHint(null);
      return;
    }
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>('.chords-assignment-row[data-assignment-id]:not(.draft)')
    ).filter((row) => row.dataset.assignmentId !== sourceId);
    if (rows.length === 0) {
      setChordAssignmentDragDropHint(null);
      return;
    }
    let nearest: { targetId: string; placement: 'before' | 'after'; distance: number } | null = null;
    for (const row of rows) {
      const targetId = row.dataset.assignmentId;
      if (!targetId) {
        continue;
      }
      const rect = row.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const placement = clientY > centerY ? 'after' : 'before';
      const edgeY = placement === 'after' ? rect.bottom : rect.top;
      const distance = Math.abs(clientY - edgeY);
      if (!nearest || distance < nearest.distance) {
        nearest = { targetId, placement, distance };
      }
    }
    setChordAssignmentDragDropHint(nearest && {
      targetId: nearest.targetId,
      placement: nearest.placement
    });
  }

  function finishChordAssignmentPointerDrag(cancelled = false) {
    const session = chordAssignmentDragRef.current;
    if (!session) {
      return;
    }
    session.cleanup();
    session.overlay?.remove();
    document.body.classList.remove('chords-assignment-pointer-dragging');
    chordAssignmentDragRef.current = null;
    setDraggedChordAssignmentId(null);
    setChordAssignmentDropHint(null);
    if (!cancelled && session.active && session.dropHint) {
      reorderChordAssignment(session.id, session.dropHint.targetId, session.dropHint.placement);
    }
    if (session.active) {
      window.addEventListener('click', (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
      }, { capture: true, once: true });
    }
  }

  function startChordAssignmentPointerDrag(event: ReactPointerEvent<HTMLDivElement>, assignmentId: string) {
    if (pendingAction !== null || event.button !== 0 || chordAssignmentDragRef.current) {
      return;
    }
    const sourceRow = event.currentTarget;
    const rect = sourceRow.getBoundingClientRect();
    const session: ChordAssignmentDragSession = {
      active: false,
      id: assignmentId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      overlay: null,
      startX: event.clientX,
      startY: event.clientY,
      cleanup: () => undefined,
      dropHint: null
    };
    const activate = (clientX: number, clientY: number) => {
      if (session.active) {
        return;
      }
      session.active = true;
      session.overlay = createChordAssignmentDragOverlay(sourceRow);
      document.body.classList.add('chords-assignment-pointer-dragging');
      setDraggedChordAssignmentId(assignmentId);
      moveChordAssignmentDragOverlay(session, clientX, clientY);
    };
    const move = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - session.startX;
      const deltaY = moveEvent.clientY - session.startY;
      if (!session.active && Math.hypot(deltaX, deltaY) < 5) {
        return;
      }
      activate(moveEvent.clientX, moveEvent.clientY);
      moveEvent.preventDefault();
      moveChordAssignmentDragOverlay(session, moveEvent.clientX, moveEvent.clientY);
      updateChordAssignmentDropTarget(assignmentId, moveEvent.clientX, moveEvent.clientY);
    };
    const end = () => finishChordAssignmentPointerDrag(false);
    const cancel = () => finishChordAssignmentPointerDrag(true);
    const keyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        finishChordAssignmentPointerDrag(true);
      }
    };
    session.cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keyDown);
    };
    chordAssignmentDragRef.current = session;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', keyDown);
  }

  function toggleHapticsEnabled() {
    if (!snapshot) return;
    void runAction('haptics-enabled', () => window.bridge.setHapticsEnabled(!snapshot.settings.hapticsEnabled));
  }

  function toggleClassicRumbleEnabled() {
    if (!snapshot) return;
    void runAction('classic-rumble-enabled', () => (
      window.bridge.setClassicRumbleEnabled(!snapshot.settings.classicRumbleEnabled)
    ));
  }

  function toggleClassicRumbleV1Enabled() {
    if (!snapshot || classicRumbleV1CommitPending) return;

    setClassicRumbleV1CommitPending(true);
    void (async () => {
      try {
        const next = await window.bridge.setClassicRumbleV1Enabled(!snapshot.settings.classicRumbleV1Enabled);
        setSnapshot(next);
      } catch {
        const next = await window.bridge.getStatus();
        setSnapshot(next);
      } finally {
        setClassicRumbleV1CommitPending(false);
      }
    })();
  }

  function toggleFeedbackBoostEnabled() {
    if (!snapshot || feedbackBoostCommitPending) return;

    setFeedbackBoostCommitPending(true);
    void (async () => {
      try {
        const next = await window.bridge.setFeedbackBoostEnabled(!snapshot.settings.feedbackBoostEnabled);
        setSnapshot(next);
        setHapticsValue(displayHapticsValue(next));
        setClassicRumbleValue(displayClassicRumbleValue(next));
      } catch {
        const next = await window.bridge.getStatus();
        setSnapshot(next);
        setHapticsValue(displayHapticsValue(next));
        setClassicRumbleValue(displayClassicRumbleValue(next));
      } finally {
        setFeedbackBoostCommitPending(false);
      }
    })();
  }

  function toggleSpeakerEnabled() {
    if (!snapshot) return;
    void runAction('speaker-enabled', () => window.bridge.setSpeakerEnabled(!snapshot.settings.speakerEnabled));
  }

  function openDeviceCleanupConfirm() {
    setDeviceCleanupMessage(null);
    setDeviceCleanupError(null);
    setDeviceCleanupConfirmVisible(true);
  }

  function closeDeviceCleanupConfirm() {
    if (pendingAction === 'device-cleanup') {
      return;
    }
    setDeviceCleanupConfirmVisible(false);
  }

  async function runWindowsDeviceCleanup() {
    if (!snapshot || pendingAction) {
      return;
    }
    setDeviceCleanupMessage(null);
    if (controllerConnected) {
      setDeviceCleanupError('Disconnect the controller from the bridge before running emergency repair.');
      return;
    }

    setPendingAction('device-cleanup');
    setDeviceCleanupError(null);
    try {
      const result = await window.bridge.repairWindowsDeviceCache();
      setDeviceCleanupMessage(result.message);
    } catch (error) {
      setDeviceCleanupError(error instanceof Error ? error.message : 'Emergency device repair could not run.');
    } finally {
      try {
        applySnapshot(await window.bridge.getStatus());
      } catch {
        // Keep the existing snapshot if status refresh fails after the repair process.
      }
      setPendingAction(null);
    }
  }


  function toggleAudioEnabled() {
    if (!snapshot) return;
    const enabled = !(snapshot.settings.speakerEnabled || snapshot.settings.duplexMicEnabled);
    void runAction('audio-enabled', async () => {
      let next = snapshot;
      if (next.settings.speakerEnabled !== enabled) {
        next = await window.bridge.setSpeakerEnabled(enabled);
      }
      if (!enabled && next.settings.duplexMicEnabled) {
        next = await window.bridge.setDuplexMicEnabled(false);
      }
      return next;
    });
  }

  function toggleDuplexMicEnabled() {
    if (!snapshot) return;
    void runAction('duplex-mic-enabled', () => (
      window.bridge.setDuplexMicEnabled(!snapshot.settings.duplexMicEnabled)
    ));
  }

  function toggleMicMute() {
    if (!snapshot) return;
    void runAction('mic-mute', () => window.bridge.setMicMute(!snapshot.settings.micMuted));
  }

  function toggleAdaptiveTriggersEnabled() {
    if (!snapshot) return;
    void runAction('triggers-enabled', () => (
      window.bridge.setAdaptiveTriggersEnabled(!snapshot.settings.adaptiveTriggersEnabled)
    ));
  }

  function clearTriggerProfileDraftPreview() {
    if (!triggerProfilePreviewArmedRef.current) return;
    triggerProfilePreviewArmedRef.current = false;
    void window.bridge.previewTriggerProfileDraft(null);
  }

  function loadTriggerProfileDraft(profile: TriggerProfile) {
    clearTriggerProfileDraftPreview();
    setSelectedTriggerProfileId(profile.id);
    setTriggerProfileDraft(profile);
    setTriggerProfileEditingState(0);
    setTriggerProfileProcessNamesInput(profile.match.processNames.join(', '));
    setTriggerProfileModifiersOpen({ l2: false, r2: false });
  }

  async function refreshTriggerProfiles(preferredId?: string, excludeId?: string) {
    const backendProfiles = await window.bridge.listTriggerProfiles();
    const profiles = mergeTriggerProfiles(triggerProfiles, backendProfiles, excludeId ? [excludeId] : []);
    setTriggerProfiles(profiles);
    const preferred = preferredId ? profiles.find((profile) => profile.id === preferredId) : undefined;
    const next = preferred ?? profiles.find((profile) => profile.id === selectedTriggerProfileId) ?? profiles[0];
    if (next) {
      loadTriggerProfileDraft(next);
    } else {
      clearTriggerProfileDraftPreview();
      setSelectedTriggerProfileId(null);
      setTriggerProfileDraft(null);
      setTriggerProfileProcessNamesInput('');
    }
    return profiles;
  }

  // Picking a profile by hand is a request to use it, so it pins the profile and auto matching
  // turns off. Without the pin the engine keeps driving whatever a running game matched -- and a
  // profile with no processNames, like Showcase, could never become active at all.
  function selectTriggerProfile(id: string) {
    const profile = triggerProfiles.find((entry) => entry.id === id);
    if (!profile) return;
    loadTriggerProfileDraft(profile);
    void pinSelectedTriggerProfile(profile.id);
  }

  function createTriggerProfile() {
    const base = createDefaultProfile();
    const name = 'New Profile';
    const id = makeProvisionalTriggerProfileId();
    const profile: TriggerProfile = {
      ...base,
      id,
      name,
      updatedAtMs: Date.now()
    };
    setTriggerProfiles((profiles) => [...profiles, profile]);
    loadTriggerProfileDraft(profile);
  }

  function duplicateTriggerProfile() {
    if (!triggerProfileDraft) return;
    const id = makeProvisionalTriggerProfileId();
    const profile: TriggerProfile = {
      ...triggerProfileDraft,
      id,
      name: `${triggerProfileDraft.name} Copy`,
      updatedAtMs: Date.now()
    };
    setTriggerProfiles((profiles) => [...profiles, profile]);
    loadTriggerProfileDraft(profile);
  }

  function openTriggerProfileDeleteConfirm(profile: TriggerProfile) {
    setTriggerProfileDeleteConfirm({ id: profile.id, name: profile.name });
  }

  async function confirmDeleteTriggerProfile() {
    if (!triggerProfileDeleteConfirm) return;
    const deletedId = triggerProfileDeleteConfirm.id;
    const target = triggerProfiles.find((profile) => profile.id === deletedId);
    // A game's trigger profile is only one facet of its Game Profile (settings,
    // artwork, detection ride on the same entry). Deleting the triggers strips
    // the effects and library linkage but keeps the game itself.
    if (target?.meta?.game) {
      await window.bridge.saveTriggerProfile({
        ...target,
        triggers: {
          l2: { base: null, modifiers: [] },
          r2: { base: null, modifiers: [] }
        },
        meta: { game: target.meta.game },
        updatedAtMs: Date.now()
      });
      setTriggerProfileDeleteConfirm(null);
      await refreshTriggerProfiles(deletedId);
      showTriggerProfileTransferStatus(
        'good',
        `Removed "${triggerProfileDeleteConfirm.name}"'s trigger effects — the game profile is kept`
      );
      return;
    }
    await window.bridge.deleteTriggerProfile(deletedId);
    setTriggerProfileDeleteConfirm(null);
    await refreshTriggerProfiles(undefined, deletedId);
  }

  // Re-downloads the library profile and overwrites this one in place, discarding local edits.
  async function confirmResetTriggerProfile() {
    if (!triggerProfileResetConfirm) return;
    const { id, name } = triggerProfileResetConfirm;
    setTriggerProfileResetting(true);
    try {
      const result = await window.bridge.resetLibraryProfile(id);
      if (!result.ok) {
        showTriggerProfileTransferStatus('warn', `Couldn't reset "${name}" — ${result.error}`);
        return;
      }
      setTriggerProfileResetConfirm(null);
      const profiles = await refreshTriggerProfiles(id);
      const match = profiles.find((profile) => profile.id === id);
      if (match) loadTriggerProfileDraft(match);
      showTriggerProfileTransferStatus('good', `Reset "${name}" to its library defaults`);
    } catch (err) {
      showTriggerProfileTransferStatus(
        'warn',
        `Couldn't reset "${name}" — ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setTriggerProfileResetting(false);
    }
  }

  async function saveTriggerProfileDraft() {
    if (!triggerProfileDraft) return;
    const processNames = parseProcessNamesInput(triggerProfileProcessNamesInput);
    const previousId = triggerProfileDraft.id;
    const isProvisional = isProvisionalTriggerProfileId(previousId);
    const id = isProvisional
      ? uniqueTriggerProfileId(
          triggerProfileDraft.name,
          triggerProfiles.filter((profile) => profile.id !== previousId).map((profile) => profile.id)
        )
      : previousId;
    const profile: TriggerProfile = sanitizeDraftStates({
      ...triggerProfileDraft,
      id,
      match: { ...triggerProfileDraft.match, processNames },
      updatedAtMs: Date.now()
    });
    const saved = await window.bridge.saveTriggerProfile(profile);
    await refreshTriggerProfiles(saved.id, isProvisional ? previousId : undefined);
  }

  function showTriggerProfileTransferStatus(
    tone: string,
    message: string,
    failures?: Array<{ file: string; error: string }>
  ) {
    if (triggerProfileTransferStatusTimeout.current) {
      clearTimeout(triggerProfileTransferStatusTimeout.current);
    }
    setTriggerProfileTransferStatus({ tone, message, failures });
    triggerProfileTransferStatusTimeout.current = setTimeout(() => {
      setTriggerProfileTransferStatus(null);
      triggerProfileTransferStatusTimeout.current = null;
    }, failures && failures.length > 0 ? 12000 : 5000);
  }

  async function exportTriggerProfileDraft() {
    if (!triggerProfileDraft) return;
    if (isProvisionalTriggerProfileId(triggerProfileDraft.id)) {
      showTriggerProfileTransferStatus('warn', 'Save the profile before exporting');
      return;
    }
    const result = await window.bridge.exportTriggerProfile(triggerProfileDraft.id);
    if (result.saved) {
      showTriggerProfileTransferStatus('good', `Exported "${triggerProfileDraft.name}"`);
    }
  }

  async function importTriggerProfilesFromDisk() {
    const results = await window.bridge.importTriggerProfiles();
    if (results.length === 0) return;
    const imported = results.filter((entry) => entry.ok);
    const failures = results
      .filter((entry) => !entry.ok)
      .map((entry) => ({
        file: entry.file.split(/[\\/]/).pop() ?? entry.file,
        error: entry.error ?? 'Unknown error'
      }));
    const profiles = await refreshTriggerProfiles();
    const firstImportedName = imported[0]?.name;
    if (firstImportedName) {
      const match = profiles.find((profile) => profile.name === firstImportedName);
      if (match) loadTriggerProfileDraft(match);
    }
    if (imported.length === 0) {
      showTriggerProfileTransferStatus(
        'bad',
        `Import failed for ${failures.length} file${failures.length === 1 ? '' : 's'}`,
        failures
      );
    } else {
      const base = `Imported ${imported.length} profile${imported.length === 1 ? '' : 's'}`;
      showTriggerProfileTransferStatus(
        failures.length > 0 ? 'warn' : 'good',
        failures.length > 0 ? `${base} (${failures.length} failed)` : base,
        failures.length > 0 ? failures : undefined
      );
    }
  }

  async function openTriggerProfileLibrary() {
    setTriggerProfileLibraryOpen(true);
    setTriggerProfileLibraryInstallErrors({});
    setTriggerProfileLibraryQuery('');
    setTriggerProfileLibraryLoading(true);
    try {
      const catalog = await window.bridge.getProfileLibraryCatalog();
      setTriggerProfileLibraryCatalog(catalog);
    } catch (err) {
      setTriggerProfileLibraryCatalog({
        entries: [],
        nativeGames: [],
        fetchedAtMs: 0,
        fromCache: false,
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setTriggerProfileLibraryLoading(false);
    }
  }

  async function installTriggerProfileFromLibrary(entry: LibraryEntry) {
    setTriggerProfileLibraryInstalling(entry.file);
    setTriggerProfileLibraryInstallErrors((errors) => {
      const next = { ...errors };
      delete next[entry.file];
      return next;
    });
    try {
      const result = await window.bridge.installLibraryProfile(entry);
      if (!result.ok) {
        setTriggerProfileLibraryInstallErrors((errors) => ({ ...errors, [entry.file]: result.error }));
        return;
      }
      const installedName = result.profile.name;
      const profiles = await refreshTriggerProfiles();
      const match = profiles.find((profile) => profile.name === installedName);
      if (match) loadTriggerProfileDraft(match);
      setTriggerProfileLibraryOpen(false);
      showTriggerProfileTransferStatus('good', `Installed "${installedName}" from the library`);
    } catch (err) {
      setTriggerProfileLibraryInstallErrors((errors) => ({
        ...errors,
        [entry.file]: err instanceof Error ? err.message : String(err)
      }));
    } finally {
      setTriggerProfileLibraryInstalling(null);
    }
  }

  async function toggleTriggerProfilesEnabled() {
    const status = await window.bridge.setTriggerProfilesEnabled(!triggerProfilesEnabled);
    setTriggerProfilesEnabled(status.enabled);
    setTriggerProfileEngineStatus(status);
  }

  async function refreshGameArtwork() {
    setGameArtwork(await window.bridge.getGameArtwork());
  }

  // Opening a game lands on its hub and switches into "Game settings" scope, so every
  // tab edits the game's snapshot until the scope is flipped back or the hub is closed.
  // Game scope is the default while a game hub is open. The scope pill derives
  // from gameSettingsStatus, so flip it optimistically — waiting for the IPC
  // round-trip made the pill start on Global and visibly jump to Game Settings.
  function setScopeOptimistically(editingProfileId: string | null) {
    setGameSettingsStatus((previous) => ({
      appliedProfileId: previous?.appliedProfileId ?? null,
      appliedBy: previous?.appliedBy ?? null,
      editingProfileId
    }));
  }

  async function openGameProfile(id: string) {
    setOpenGameProfileId(id);
    setScopeOptimistically(id);
    recordNavState('game-profile', id);
    const status = await window.bridge.enterGameSettingsScope(id);
    setGameSettingsStatus(status);
  }

  async function setGameSettingsScope(scope: 'game' | 'global') {
    if (!openGameProfileId) return;
    setScopeOptimistically(scope === 'game' ? openGameProfileId : null);
    const status = scope === 'game'
      ? await window.bridge.enterGameSettingsScope(openGameProfileId)
      : await window.bridge.exitGameSettingsScope();
    setGameSettingsStatus(status);
  }

  async function closeGameProfile() {
    setOpenGameProfileId(null);
    setScopeOptimistically(null);
    recordNavState('game-profile', null);
    selectControlTab('game-profile');
    const status = await window.bridge.exitGameSettingsScope();
    setGameSettingsStatus(status);
  }

  function openGameCreateDialog() {
    setGameCreateName('');
    setGameCreateProcessesInput('');
    setGameCreateCandidates(null);
    setSelectedInstalledGame(null);
    setInstalledCandidateTicks({});
    setGameCreateOpen(true);
    void loadInstalledGames(false);
  }

  async function loadInstalledGames(refresh: boolean) {
    if (installedGames !== null && !refresh) return;
    setInstalledGamesLoading(true);
    try {
      setInstalledGames(await window.bridge.listInstalledGames(refresh));
    } catch {
      setInstalledGames({ games: [], errors: ['Scan failed'] });
    } finally {
      setInstalledGamesLoading(false);
    }
  }

  function pickInstalledGame(game: InstalledGamesList['games'][number]) {
    if (selectedInstalledGame?.sourceId === game.sourceId) {
      setSelectedInstalledGame(null);
      setInstalledCandidateTicks({});
      setGameCreateName('');
      return;
    }
    setSelectedInstalledGame(game);
    setGameCreateName(game.name);
    // Junk-scored candidates start unticked; everything else is presumed right.
    const ticks: Record<string, boolean> = {};
    for (const candidate of game.processCandidates) {
      ticks[candidate] = !game.junkCandidates.includes(candidate);
    }
    setInstalledCandidateTicks(ticks);
  }

  async function detectGameCreateProcesses() {
    setGameCreateDetectLoading(true);
    try {
      setGameCreateCandidates(await window.bridge.listCandidateGameProcesses());
    } finally {
      setGameCreateDetectLoading(false);
    }
  }

  async function submitGameCreate() {
    const name = gameCreateName.trim();
    if (!name || gameCreateBusy) return;
    const tickedCandidates = selectedInstalledGame
      ? selectedInstalledGame.processCandidates.filter((candidate) => installedCandidateTicks[candidate])
      : [];
    const processNames = [...new Set([
      ...tickedCandidates.map((candidate) => candidate.toLowerCase()),
      ...parseProcessNamesInput(gameCreateProcessesInput)
    ])];
    setGameCreateBusy(true);
    try {
      // The OpenDS5-Profiles catalog decides what the new game gets: a published
      // profile installs as-is, a native game keeps the default feel, anything
      // else starts without custom triggers. New blank trigger profiles are
      // never created here.
      const catalog = triggerProfileLibraryCatalog
        ?? await window.bridge.getProfileLibraryCatalog().catch(() => null);
      const match = matchGameInLibrary(catalog, name);

      let saved: TriggerProfile | null = null;
      if (match.kind === 'profile') {
        const installed = await window.bridge.installLibraryProfile(match.entry);
        if (installed.ok) {
          saved = installed.profile;
          if (processNames.length > 0) {
            const mergedProcesses = [...new Set([...saved.match.processNames, ...processNames])];
            saved = await window.bridge.saveTriggerProfile({
              ...saved,
              match: { ...saved.match, processNames: mergedProcesses },
              updatedAtMs: Date.now()
            });
          }
        }
      }
      if (!saved) {
        const id = uniqueTriggerProfileId(name, triggerProfiles.map((profile) => profile.id));
        const base = createDefaultProfile();
        saved = await window.bridge.saveTriggerProfile({
          ...base,
          id,
          name,
          match: { processNames, windowTitles: [] },
          meta: { game: name },
          updatedAtMs: Date.now()
        });
      }
      await refreshTriggerProfiles(saved.id);
      setGameCreateOpen(false);
      // Cover art is decoration: fetch in the background and never block creation
      // on it. A launcher's own artwork (Steam cache, Heroic art_cover) wins over
      // the keyless proxy lookup.
      const savedId = saved.id;
      const launcherArtwork = selectedInstalledGame?.artwork
        ? window.bridge.applyInstalledGameArtwork(savedId, selectedInstalledGame.sourceId)
        : Promise.resolve({ ok: false as const, error: 'no launcher artwork' });
      void launcherArtwork.then(async (applied) => {
        if (!applied.ok) {
          const fallback = await window.bridge.applyGameArtwork(savedId, null);
          if (!fallback.ok) return;
        }
        await refreshGameArtwork();
      });
      // The scanned list is filtered against existing profiles main-side; drop the
      // renderer cache so the next dialog open re-filters (the scan itself stays cached).
      setInstalledGames(null);
      await openGameProfile(savedId);
    } finally {
      setGameCreateBusy(false);
    }
  }

  async function confirmDeleteGameProfile(keepTriggerEffects: boolean) {
    if (!gameDeleteConfirm) return;
    const deletedId = gameDeleteConfirm.id;
    if (openGameProfileId === deletedId) {
      setOpenGameProfileId(null);
    }
    await window.bridge.deleteGameProfile(deletedId, keepTriggerEffects);
    setGameDeleteConfirm(null);
    setGameSettingsStatus(await window.bridge.getGameSettingsStatus());
    await refreshTriggerProfiles(undefined, keepTriggerEffects ? undefined : deletedId);
    await refreshGameArtwork();
  }

  function openGameArtworkDialog(profileId: string, initialQuery: string) {
    setGameArtworkDialogFor(profileId);
    setGameArtworkQuery(initialQuery);
    setGameArtworkResults(null);
    setGameArtworkError(null);
    setSteamGridDbKeyDraft(null);
  }

  async function saveSteamGridDbKeyDraft() {
    if (steamGridDbKeyDraft === null) return;
    await window.bridge.setSteamGridDbApiKey(steamGridDbKeyDraft);
    setSteamGridDbKeyDraft(null);
  }

  async function searchGameArtworkDialog() {
    if (gameArtworkBusy) return;
    setGameArtworkBusy(true);
    setGameArtworkError(null);
    try {
      await saveSteamGridDbKeyDraft();
      const response = await window.bridge.searchGameArtwork(gameArtworkQuery);
      if (response.ok) {
        setGameArtworkResults(response.results);
        if (response.results.length === 0) {
          setGameArtworkError(`No SteamGridDB results for "${gameArtworkQuery.trim()}"`);
        }
      } else {
        setGameArtworkResults(null);
        setGameArtworkError(response.error);
      }
    } finally {
      setGameArtworkBusy(false);
    }
  }

  async function applyGameArtworkChoice(result: GameArtworkSearchResult) {
    if (!gameArtworkDialogFor || gameArtworkBusy) return;
    setGameArtworkBusy(true);
    setGameArtworkError(null);
    try {
      const response = await window.bridge.applyGameArtwork(gameArtworkDialogFor, result);
      if (!response.ok) {
        setGameArtworkError(response.error);
        return;
      }
      await refreshGameArtwork();
      setGameArtworkDialogFor(null);
    } finally {
      setGameArtworkBusy(false);
    }
  }

  async function removeGameArtworkChoice() {
    if (!gameArtworkDialogFor) return;
    setGameArtwork(await window.bridge.removeGameArtwork(gameArtworkDialogFor));
    setGameArtworkDialogFor(null);
  }

  function openGameTriggerEditor(profile: TriggerProfile) {
    // Games with native trigger support drive the triggers themselves; custom
    // settings stay disabled for those.
    if (nativeGameFeatures(nativeFeatureMap, profile)?.triggers) return;
    loadTriggerProfileDraft(profile);
    selectControlTab('trigger-profiles');
  }

  async function pinSelectedTriggerProfile(id: string) {
    const status = await window.bridge.pinTriggerProfile(id === '' ? null : id);
    setTriggerProfileEngineStatus(status);
  }

  async function selectEngineTriggerState(name: string) {
    const status = await window.bridge.selectTriggerProfileState(name);
    setTriggerProfileEngineStatus(status);
  }

  function addTriggerProfileState() {
    if (!triggerProfileDraft) return;
    const existing = triggerProfileDraft.states ?? [];
    if (existing.length >= MAX_STATES_PER_PROFILE) return;
    // A states-less profile first absorbs its current feel as state one, so
    // "Add state" always yields the old feel plus a fresh empty one.
    const seeded: TriggerStateDef[] = existing.length > 0
      ? [...existing]
      : [{ name: 'Default', triggers: triggerProfileDraft.triggers }];
    const name = uniqueStateName(`State ${seeded.length + 1}`, seeded.map((state) => state.name));
    seeded.push({ name, triggers: emptyTriggerSlotPair() });
    setTriggerProfileDraft({
      ...triggerProfileDraft,
      states: seeded,
      switching: triggerProfileDraft.switching ?? { rules: [] },
      triggers: seeded[0].triggers
    });
    setTriggerProfileEditingState(seeded.length - 1);
  }

  function renameTriggerProfileState(index: number, name: string) {
    setTriggerProfileDraft((draft) => {
      if (!draft?.states || !draft.states[index]) return draft;
      const previous = draft.states[index].name;
      const states = draft.states.map((state, at) => (at === index ? { ...state, name } : state));
      // Keep rules and defaultState pointing at the renamed state.
      const switching = draft.switching
        ? {
            ...draft.switching,
            rules: draft.switching.rules.map((rule) => (
              rule.action === 'select' && rule.state === previous ? { ...rule, state: name } : rule
            )),
            ...(draft.switching.stickWheel
              ? {
                  stickWheel: {
                    ...draft.switching.stickWheel,
                    sectors: draft.switching.stickWheel.sectors.map((entry) => (
                      entry === previous ? name : entry
                    ))
                  }
                }
              : {}),
            ...(draft.switching.defaultState === previous ? { defaultState: name } : {})
          }
        : draft.switching;
      return { ...draft, states, ...(switching ? { switching } : {}) };
    });
  }

  function duplicateTriggerProfileState(index: number) {
    if (!triggerProfileDraft?.states) return;
    const states = triggerProfileDraft.states;
    if (!states[index] || states.length >= MAX_STATES_PER_PROFILE) return;
    const source = states[index];
    const name = uniqueStateName(source.name, states.map((state) => state.name));
    const copy: TriggerStateDef = {
      name,
      triggers: {
        l2: { base: source.triggers.l2.base, modifiers: [...source.triggers.l2.modifiers] },
        r2: { base: source.triggers.r2.base, modifiers: [...source.triggers.r2.modifiers] }
      }
    };
    const next = [...states.slice(0, index + 1), copy, ...states.slice(index + 1)];
    setTriggerProfileDraft({ ...triggerProfileDraft, states: next, triggers: next[0].triggers });
    setTriggerProfileEditingState(index + 1);
  }

  function removeTriggerProfileState(index: number) {
    setTriggerProfileDraft((draft) => {
      if (!draft?.states || !draft.states[index]) return draft;
      const removed = draft.states[index].name;
      const states = draft.states.filter((_, at) => at !== index);
      if (states.length <= 1) {
        // One state is no states: collapse back to a plain profile.
        const { states: _states, switching: _switching, ...rest } = draft;
        return { ...rest, triggers: states[0]?.triggers ?? draft.states[index].triggers };
      }
      const switching = draft.switching
        ? {
            ...draft.switching,
            rules: draft.switching.rules.filter((rule) => rule.action !== 'select' || rule.state !== removed),
            ...(draft.switching.stickWheel
              ? {
                  stickWheel: {
                    ...draft.switching.stickWheel,
                    sectors: draft.switching.stickWheel.sectors.map((entry) => (
                      entry === removed ? null : entry
                    ))
                  }
                }
              : {})
          }
        : undefined;
      if (switching && switching.defaultState === removed) delete switching.defaultState;
      return { ...draft, states, ...(switching ? { switching } : {}), triggers: states[0].triggers };
    });
    setTriggerProfileEditingState(0);
  }

  function updateTriggerProfileSwitching(updater: (switching: StateSwitching) => StateSwitching) {
    setTriggerProfileDraft((draft) => {
      if (!draft?.states || draft.states.length === 0) return draft;
      return { ...draft, switching: updater(draft.switching ?? { rules: [] }) };
    });
  }

  function updateTriggerProfileSwitchRule(index: number, patch: Partial<StateSwitchRule>) {
    updateTriggerProfileSwitching((switching) => ({
      ...switching,
      rules: switching.rules.map((rule, at) => {
        if (at !== index) return rule;
        const next: StateSwitchRule = { ...rule, ...patch };
        if (next.action === 'cycle') delete next.state;
        if (next.while === '') delete next.while;
        return next;
      })
    }));
  }

  function updateTriggerProfileSlot(
    slot: TriggerProfileSlotKey,
    updater: (config: TriggerProfile['triggers']['l2']) => TriggerProfile['triggers']['l2'],
    options?: { mirrorBase?: boolean }
  ) {
    triggerProfilePreviewArmedRef.current = true;
    setTriggerProfileDraft((draft) => {
      if (!draft) return draft;
      const current = editingStateTriggers(draft, triggerProfileEditingState);
      let triggers = { ...current, [slot]: updater(current[slot]) };
      if (options?.mirrorBase) {
        triggers = mirrorTriggerSlotBase(triggers, slot);
      }
      if (draft.states && draft.states.length > 0) {
        const index = Math.min(triggerProfileEditingState, draft.states.length - 1);
        const states = draft.states.map((state, at) => (at === index ? { ...state, triggers } : state));
        // The profile-level triggers mirror states[0] (back-compat invariant).
        return { ...draft, states, triggers: index === 0 ? triggers : draft.triggers };
      }
      return { ...draft, triggers };
    });
  }

  function toggleTriggerProfilesLinked(sourceSlot: TriggerProfileSlotKey) {
    const nextLinked = !triggerProfilesLinked;
    setTriggerProfilesLinked(nextLinked);
    if (nextLinked) {
      updateTriggerProfileSlot(sourceSlot, (config) => config, { mirrorBase: true });
    }
  }

  function triggerProfileNameById(id: string): string {
    return triggerProfiles.find((profile) => profile.id === id)?.name ?? id;
  }

  function toggleLightbarEnabled() {
    if (!snapshot) return;
    void runAction('lightbar-enabled', () => window.bridge.setLightbarEnabled(!snapshot.settings.lightbarEnabled));
  }

  function focusBridgeSettings(target: SettingsFocusTarget) {
    setShowNotificationsMenu(false);
    setShowBridgeSettings(true);
    setNotificationFocusTarget(null);
    setSettingsFocusTarget(target);
    if (settingsFocusTimerRef.current !== null) {
      window.clearTimeout(settingsFocusTimerRef.current);
    }
    settingsFocusTimerRef.current = window.setTimeout(() => {
      setSettingsFocusTarget(null);
      settingsFocusTimerRef.current = null;
    }, 2200);
  }

  function focusNotificationSettings(target: NotificationFocusTarget) {
    setShowBridgeSettings(false);
    setShowNotificationsMenu(true);
    setSettingsFocusTarget(null);
    setNotificationFocusTarget(target);
    if (notificationFocusTimerRef.current !== null) {
      window.clearTimeout(notificationFocusTimerRef.current);
    }
    notificationFocusTimerRef.current = window.setTimeout(() => {
      setNotificationFocusTarget(null);
      notificationFocusTimerRef.current = null;
    }, 2200);
  }

  function setMuteButtonAction(
    mode: MuteButtonMode,
    usage?: number,
    modifiers?: number,
    behavior?: MuteKeyboardBehavior,
    chordStarterEnabled?: boolean
  ) {
    if (!snapshot) {
      return;
    }
    const keyUsage = usage ?? snapshot.settings.muteKeyboardUsage;
    const keyModifiers = modifiers ?? snapshot.settings.muteKeyboardModifiers;
    const keyBehavior = behavior ?? snapshot.settings.muteKeyboardBehavior;
    const keyChordStarterEnabled = chordStarterEnabled ?? snapshot.settings.muteKeyboardChordStarterEnabled;
    void runAction('mute-button', () => (
      window.bridge.setMuteButtonAction(mode, keyUsage, keyModifiers, keyBehavior, keyChordStarterEnabled)
    ));
  }

  function setMuteModifier(bit: number, enabled: boolean) {
    if (!snapshot) {
      return;
    }
    const nextModifiers = enabled
      ? snapshot.settings.muteKeyboardModifiers | bit
      : snapshot.settings.muteKeyboardModifiers & ~bit;
    setMuteButtonAction(
      snapshot.settings.muteButtonMode,
      snapshot.settings.muteKeyboardUsage,
      nextModifiers,
      snapshot.settings.muteKeyboardBehavior,
      snapshot.settings.muteKeyboardChordStarterEnabled
    );
  }

  function clearOverviewSleepConfirmation() {
    overviewSleepConfirmArmedRef.current = false;
    setOverviewSleepConfirmVisible(false);
    if (overviewSleepConfirmTimerRef.current !== null) {
      window.clearTimeout(overviewSleepConfirmTimerRef.current);
      overviewSleepConfirmTimerRef.current = null;
    }
  }

  function armOverviewSleepConfirmation() {
    overviewSleepConfirmArmedRef.current = true;
    setOverviewSleepConfirmVisible(true);
    if (overviewSleepConfirmTimerRef.current !== null) {
      window.clearTimeout(overviewSleepConfirmTimerRef.current);
    }
    overviewSleepConfirmTimerRef.current = window.setTimeout(() => {
      overviewSleepConfirmArmedRef.current = false;
      setOverviewSleepConfirmVisible(false);
      overviewSleepConfirmTimerRef.current = null;
    }, SLEEP_CONFIRM_MS);
  }

  function handleOverviewSleepController() {
    if (!snapshot || !connected || !sleepControllerSupported || !controllerConnected || pendingAction !== null) {
      return;
    }
    if (!overviewSleepConfirmArmedRef.current) {
      armOverviewSleepConfirmation();
      return;
    }
    clearOverviewSleepConfirmation();
    void runAction('overview-sleep-controller', () => window.bridge.sleepController());
  }

  function toggleControllerNotifications() {
    if (!snapshot) return;
    void runAction('notify-controller', () => (
      window.bridge.setNotifyControllerConnection(!snapshot.settings.notifyControllerConnection)
    ));
  }

  function toggleLowBatteryNotifications() {
    if (!snapshot) return;
    void runAction('notify-battery', () => (
      window.bridge.setNotifyLowBattery(!snapshot.settings.notifyLowBattery)
    ));
  }

  function setPollingRateMode(mode: PollingRateMode) {
    void runAction('polling-rate', () => window.bridge.setPollingRateMode(mode));
  }

  function setHostPersonaMode(mode: HostPersonaMode) {
    void runAction('host-persona', () => window.bridge.setHostPersonaMode(mode));
  }

  function testNotifications() {
    void runAction('notify-test', () => window.bridge.testNotification());
  }

  function selectControlTab(tab: ControlTab) {
    if (tab === activeControlTab) {
      return;
    }
    setShowCustomColorPicker(false);
    setShowBridgeSettings(false);
    setShowNotificationsMenu(false);
    setActiveControlTab(tab);
    recordNavState(tab, openGameProfileId);
  }

  // Mouse back/forward buttons walk a small in-app history over
  // (control tab, open game hub) — the two axes of navigation the app has.
  function recordNavState(tab: ControlTab, gameId: string | null) {
    if (navApplyingRef.current) return;
    const history = navHistoryRef.current;
    const current = history[navIndexRef.current];
    if (current && current.tab === tab && current.gameId === gameId) return;
    history.splice(navIndexRef.current + 1);
    history.push({ tab, gameId });
    if (history.length > 50) history.shift();
    navIndexRef.current = history.length - 1;
  }

  applyNavStateRef.current = (state: { tab: ControlTab; gameId: string | null }) => {
    navApplyingRef.current = true;
    try {
      if (state.gameId !== openGameProfileId) {
        setOpenGameProfileId(state.gameId);
        setScopeOptimistically(state.gameId);
        if (state.gameId === null) {
          void window.bridge.exitGameSettingsScope().then(setGameSettingsStatus);
        } else {
          void window.bridge.enterGameSettingsScope(state.gameId).then(setGameSettingsStatus);
        }
      }
      selectControlTab(state.tab);
    } finally {
      navApplyingRef.current = false;
    }
  };

  const activeTheme = snapshot?.settings.uiThemePreset ?? startupTheme;

  if (!snapshot || startupVisible) {
    return (
      <div className="shell loading" data-theme={activeTheme}>
        <StartupScreen ready={Boolean(snapshot)} />
      </div>
    );
  }

  const kofiBadgeUrl = UI_THEME_KOFI_BADGES[activeTheme] ?? UI_THEME_KOFI_BADGES[DEFAULT_UI_THEME_PRESET];

  return (
    <div
      className={[
        'shell',
        windowDragging ? 'window-dragging' : '',
        controllerControlsAvailable ? '' : 'controller-unavailable'
      ].filter(Boolean).join(' ')}
      data-theme={activeTheme}
    >
      <div className="window-resize-edge" />
      <div
        className="window-bar"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('.bridge-tools') || target.closest('.window-actions')) {
            return;
          }
          setShowBridgeSettings(false);
          setShowNotificationsMenu(false);
          if (event.button === 0) {
            beginWindowDrag();
          }
        }}
      >
        <span className="bridge-wordmark" aria-label="OpenDS5">
          <span className="bridge-wordmark-ds">Open</span>
          <span className="bridge-wordmark-name">DS5</span>
        </span>
        <div className="topbar-right">
          <div className="bridge-tools">
            <div className="notifications-control" ref={notificationsRef}>
              <button
                className={`topbar-tool notification-tool ${showNotificationsMenu ? 'active' : ''} ${notificationsEnabled ? 'armed' : ''}`}
                type="button"
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={showNotificationsMenu}
                onClick={() => setShowNotificationsMenu((value) => !value)}
              >
                <Bell size={18} />
              </button>
              {showNotificationsMenu && (
                <div className="settings-menu notifications-menu" role="menu" aria-label="Notifications">
                  <div className="settings-menu-heading">
                    <Bell size={16} />
                    <span>Notifications</span>
                  </div>
                  <div className={`settings-menu-row ${notificationFocusTarget === 'controller-status' || notificationFocusTarget === 'all' ? 'settings-menu-row-highlight' : ''}`}>
                    <div>
                      <strong>Controller Status</strong>
                      <span>Toast when the controller connects or disconnects</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={controllerToastEnabled}
                      className={`switch ${controllerToastEnabled ? 'on' : ''}`}
                      disabled={pendingAction !== null}
                      onClick={toggleControllerNotifications}
                    >
                      <span />
                    </button>
                  </div>
                  <div className={`settings-menu-row ${notificationFocusTarget === 'low-battery' || notificationFocusTarget === 'all' ? 'settings-menu-row-highlight' : ''}`}>
                    <div>
                      <strong>Low Battery</strong>
                      <span>Toast when battery reaches 20% or below</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={lowBatteryToastEnabled}
                      className={`switch ${lowBatteryToastEnabled ? 'on' : ''}`}
                      disabled={pendingAction !== null}
                      onClick={toggleLowBatteryNotifications}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="settings-menu-action">
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={testNotifications}
                    >
                      Test Toast
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span className="bridge-tool-divider" aria-hidden="true" />
          </div>
          <div className="window-actions">
            <button type="button" title="Minimize" onClick={() => void window.bridge.minimizeWindow()}>
              <Minus size={16} />
            </button>
            <button type="button" title="Hide to tray" onClick={() => void window.bridge.hideWindow()}>
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <main className="app-content">
        <section className={`hero-card status-${statusTone}`}>
          <div className="sidebar-section-label">Device</div>
          <div className={`hero-main device-status-${sidebarDeviceTone}`}>
            <img className="controller-art" src={controllerImage} alt="" />
            <div className="status-copy">
              <div className="connection-row">
                <strong>{sidebarDeviceTitle}</strong>
              </div>
              <div className="bridge-state compact-device-status">
                <span>{sidebarDeviceStatus}</span>
              </div>
              <div className="battery-row compact-battery-row">
                {connected && controllerConnected && (
                  <span
                    className={`battery-icon ${batteryLevelTone} ${batteryCharging ? 'charging' : ''}`}
                    aria-hidden="true"
                  >
                    {[0, 1, 2].map((segment) => (
                      <span
                        key={segment}
                        className={[
                          segment < batterySegmentCount ? 'active' : '',
                          segment === batteryChargingSegment ? 'charging-segment' : '',
                          segment === 0 && batteryCritical ? 'critical-segment' : ''
                        ].filter(Boolean).join(' ')}
                      />
                    ))}
                  </span>
                )}
                <span>{sidebarBatteryLabel}</span>
              </div>
            </div>
          </div>
          <div className="sidebar-section-label">Controls</div>
          <div className="sidebar-controls">
            <div className="control-tabs" role="tablist" aria-label="Controls">
              {CONTROL_TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  id={`control-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeControlTab === id}
                  aria-controls={`control-panel-${id}`}
                  className={activeControlTab === id ? 'active' : ''}
                  onClick={() => selectControlTab(id)}
                >
                  <Icon size={18} stroke={2} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="sidebar-actions">
            <div className="sidebar-support">
              <button
                className="sidebar-kofi-link"
                type="button"
                aria-label="Support LordVicky on Ko-fi"
                onClick={() => void window.bridge.openExternal('https://ko-fi.com/lordvicky')}
              >
                <img className="sidebar-kofi-badge" src={kofiBadgeUrl} alt="" />
              </button>
            </div>
            <div className="header-settings">
              <button
                className={`sidebar-action-button ${showBridgeSettings ? 'active' : ''}`}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={showBridgeSettings}
                onClick={() => setShowBridgeSettings((value) => !value)}
              >
                <SettingsIcon size={18} />
                <span>Settings</span>
              </button>
              <button
                className={`sidebar-action-button ${activeControlTab === 'chords' ? 'active' : ''}`}
                id="control-tab-chords"
                type="button"
                aria-controls="control-panel-chords"
                aria-selected={activeControlTab === 'chords'}
                onClick={() => selectControlTab('chords')}
              >
                <IconReplace size={18} />
                <span>Chords</span>
              </button>
            </div>
          </div>
        </section>

      <section className={`control-panel flat-control-panel ${openGameProfileEntry && activeControlTab !== 'game-profile' ? 'game-scope-active' : ''}`}>
        {openGameProfileEntry && activeControlTab !== 'game-profile' && (
          <div className="game-scope-banner" role="region" aria-label="Game settings scope">
            <div className="game-scope-banner-heading">
              <strong>{gameProfileTitle(openGameProfileEntry)}</strong>
              <span>
                {gameSettingsScope === 'game'
                  ? `Saving to ${gameProfileTitle(openGameProfileEntry)}'s game settings`
                  : 'Saving to your global settings'}
              </span>
            </div>
            <div className="game-scope-toggle" role="group" aria-label="Settings scope">
              <button
                type="button"
                className={gameSettingsScope === 'game' ? 'active' : ''}
                aria-pressed={gameSettingsScope === 'game'}
                onClick={() => void setGameSettingsScope('game')}
              >
                Game Settings
              </button>
              <button
                type="button"
                className={gameSettingsScope === 'global' ? 'active' : ''}
                aria-pressed={gameSettingsScope === 'global'}
                onClick={() => void setGameSettingsScope('global')}
              >
                Global Settings
              </button>
            </div>
            <button
              className="nav-back"
              type="button"
              onClick={() => selectControlTab('game-profile')}
            >
              <span className="nav-back-arrow" aria-hidden="true"><ChevronLeft size={22} /></span>
              <span className="nav-back-lines">
                <i>Back to</i>
                <b>Game Profile</b>
              </span>
            </button>
          </div>
        )}
        <div className="control-pages">
          <div
            className={`control-page game-profile-page ${activeControlTab === 'game-profile' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-game-profile"
            aria-labelledby="control-tab-game-profile"
            aria-hidden={activeControlTab !== 'game-profile'}
          >
            {openGameProfileEntry === null ? (
              <>
                <div className="feature-heading">
                  <div>
                    <h2>Game Profile</h2>
                    <p>Everything about a game — triggers, haptics, audio, lighting and remapping — in one place.</p>
                  </div>
                  <div className="trigger-profiles-status-group game-profile-engine-badge">
                    <span className="overview-status-heading">
                      <Activity size={14} />
                      Auto Switching
                    </span>
                    <span className="status-badge">
                      <span className={`dot ${triggerProfilesEnabled ? 'good' : 'warn'}`} />
                      <strong>{triggerProfilesEnabled ? 'Running' : 'Off'}</strong>
                    </span>
                  </div>
                  <div className="inline-switch">
                    <span>Auto Switching</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={triggerProfilesEnabled}
                      aria-label="Enable automatic game profile switching"
                      className={`switch ${triggerProfilesEnabled ? 'on' : ''}`}
                      onClick={() => void toggleTriggerProfilesEnabled()}
                    >
                      <span />
                    </button>
                  </div>
                </div>
                <div className="game-profile-content">
                  {activeGameProfile && (
                    <section className="game-hero" aria-label="Now playing">
                      <span
                        className={`game-hero-art ${gameArtwork[activeGameProfile.id] ? 'has-image' : gameTileArtClass(activeGameProfile.id)}`}
                        style={gameArtwork[activeGameProfile.id]
                          ? { backgroundImage: `url("${gameArtwork[activeGameProfile.id]}")` }
                          : undefined}
                        aria-hidden="true"
                      >
                        {!gameArtwork[activeGameProfile.id] && (
                          <span className="game-tile-monogram">{gameTileMonogram(gameProfileTitle(activeGameProfile))}</span>
                        )}
                      </span>
                      <div className="game-hero-copy">
                        <span className="game-hero-kicker">
                          <span className="dot good" />
                          Now Playing
                          {triggerProfileEngineStatus?.matchedName ? ` · ${triggerProfileEngineStatus.matchedName}` : ''}
                        </span>
                        <h3>{gameProfileTitle(activeGameProfile)}</h3>
                        <div className="game-tile-chips">
                          <span className={`game-tile-chip ${triggerProfileHasEffects(activeGameProfile) ? 'on' : ''}`}>
                            Triggers
                          </span>
                          <span className={`game-tile-chip ${gameSettingsStatus?.appliedProfileId === activeGameProfile.id ? 'on' : ''}`}>
                            {gameSettingsStatus?.appliedProfileId === activeGameProfile.id ? 'Game Settings' : 'Global Settings'}
                          </span>
                        </div>
                        {(() => {
                          if (!triggerProfileEngineStatus?.enabled || !triggerProfileEngineStatus.activeStateName) return null;
                          const activeStates = triggerProfiles.find(
                            (profile) => profile.id === triggerProfileEngineStatus.activeProfileId
                          )?.states;
                          if (!activeStates || activeStates.length < 2) return null;
                          return (
                            <div className="trigger-profiles-live-state-chips game-hero-states">
                              {activeStates.map((state) => (
                                <button
                                  key={state.name}
                                  type="button"
                                  className={`trigger-lab-chip compact ${
                                    state.name === triggerProfileEngineStatus.activeStateName ? 'active' : ''
                                  }`}
                                  aria-pressed={state.name === triggerProfileEngineStatus.activeStateName}
                                  onClick={() => void selectEngineTriggerState(state.name)}
                                >
                                  <span className="trigger-lab-chip-label">{state.name}</span>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="game-hero-actions">
                        <button
                          type="button"
                          className="primary-action"
                          onClick={() => void openGameProfile(activeGameProfile.id)}
                        >
                          <Pencil size={14} />
                          Customize
                        </button>
                      </div>
                    </section>
                  )}
                  <div className="game-tile-grid">
                    {gameProfiles.map((profile) => {
                      const title = gameProfileTitle(profile);
                      const art = gameArtwork[profile.id];
                      const native = nativeGameFeatures(nativeFeatureMap, profile);
                      const live = Boolean(
                        triggerProfileEngineStatus?.enabled
                        && triggerProfileEngineStatus.activeProfileId === profile.id
                      );
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          className={`game-tile ${live ? 'playing' : ''}`}
                          onClick={() => void openGameProfile(profile.id)}
                        >
                          <span
                            className={`game-tile-art ${art ? 'has-image' : gameTileArtClass(profile.id)}`}
                            style={art ? { backgroundImage: `url("${art}")` } : undefined}
                            aria-hidden="true"
                          >
                            {!art && <span className="game-tile-monogram">{gameTileMonogram(title)}</span>}
                          </span>
                          {native && <span className="game-tile-native-badge">Native</span>}
                          {live && (
                            <span className="game-tile-live">
                              <span className="dot" />
                              Playing
                            </span>
                          )}
                          <span className="game-tile-meta">
                            <strong>{title}</strong>
                            <span className="game-tile-chips">
                              {native?.triggers ? (
                                <span className="game-tile-chip native on">Native triggers</span>
                              ) : (
                                <span className={`game-tile-chip ${triggerProfileHasEffects(profile) ? 'on' : ''}`}>
                                  Triggers
                                </span>
                              )}
                              {native?.haptics && <span className="game-tile-chip native on">Haptics</span>}
                              {native?.lightbar && <span className="game-tile-chip native on">LED</span>}
                              <span className={`game-tile-chip ${gameHasSettings(profile.id) ? 'on' : ''}`}>
                                Settings
                              </span>
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="game-tile game-tile-add"
                      onClick={openGameCreateDialog}
                    >
                      <Plus size={22} />
                      <span>Add Game</span>
                    </button>
                  </div>
                  {gameProfiles.length === 0 && (
                    <p className="game-profile-empty-hint">
                      Add a game to give it its own trigger effects, sound, lighting and button mapping —
                      or install one from the library in the Trigger Profiles tab.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="feature-heading game-detail-heading">
                  <div>
                    <h2>{gameProfileTitle(openGameProfileEntry)}</h2>
                    <p>
                      {openGameProfileEntry.match.processNames.length > 0
                        ? `Applies automatically when ${openGameProfileEntry.match.processNames.join(', ')} is running.`
                        : 'No process match yet — add one in the trigger editor so this game is detected.'}
                    </p>
                  </div>
                  <button
                    className="nav-back"
                    type="button"
                    onClick={() => void closeGameProfile()}
                  >
                    <span className="nav-back-arrow" aria-hidden="true"><ChevronLeft size={22} /></span>
                    <span className="nav-back-lines">
                      <i>Back to</i>
                      <b>All Games</b>
                    </span>
                  </button>
                </div>
                <div className="game-profile-content">
                  <section className="game-detail-header">
                    <button
                      type="button"
                      className={`game-detail-art ${gameArtwork[openGameProfileEntry.id] ? 'has-image' : gameTileArtClass(openGameProfileEntry.id)}`}
                      style={gameArtwork[openGameProfileEntry.id]
                        ? { backgroundImage: `url("${gameArtwork[openGameProfileEntry.id]}")` }
                        : undefined}
                      aria-label="Back to all games"
                      onClick={() => void closeGameProfile()}
                    >
                      {!gameArtwork[openGameProfileEntry.id] && (
                        <span className="game-tile-monogram">{gameTileMonogram(gameProfileTitle(openGameProfileEntry))}</span>
                      )}
                      <span className="game-detail-art-overlay">
                        <IconArrowLeft size={16} />
                        All Games
                      </span>
                    </button>
                    <div className="game-detail-copy">
                      <span className="game-detail-status">
                        {triggerProfileEngineStatus?.enabled && triggerProfileEngineStatus.activeProfileId === openGameProfileEntry.id ? (
                          <>
                            <span className="dot good" />
                            Playing now
                            {gameSettingsStatus?.appliedProfileId === openGameProfileEntry.id ? ' — game settings active' : ''}
                          </>
                        ) : gameHasSettings(openGameProfileEntry.id) ? (
                          <>
                            <span className="dot" />
                            Game settings ready — applied when the game is detected
                          </>
                        ) : (
                          <>
                            <span className="dot" />
                            Using your global settings
                          </>
                        )}
                      </span>
                      <div className="game-scope-toggle" role="group" aria-label="Settings scope">
                        <button
                          type="button"
                          className={gameSettingsScope === 'game' ? 'active' : ''}
                          aria-pressed={gameSettingsScope === 'game'}
                          onClick={() => void setGameSettingsScope('game')}
                        >
                          Game Settings
                        </button>
                        <button
                          type="button"
                          className={gameSettingsScope === 'global' ? 'active' : ''}
                          aria-pressed={gameSettingsScope === 'global'}
                          onClick={() => void setGameSettingsScope('global')}
                        >
                          Global Settings
                        </button>
                      </div>
                      <p className="game-scope-hint">
                        {gameSettingsScope === 'game'
                          ? 'Every tab now edits this game’s own settings. Your global settings stay untouched and come back when the game exits.'
                          : 'Every tab edits your global settings. Switch to Game Settings to tune this game without touching them.'}
                      </p>
                    </div>
                    <div className="game-detail-actions">
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => openGameArtworkDialog(openGameProfileEntry.id, gameProfileTitle(openGameProfileEntry))}
                      >
                        <IconPhoto size={14} />
                        Cover Art
                      </button>
                      <button
                        type="button"
                        className="secondary-action danger"
                        onClick={() => setGameDeleteConfirm({
                          id: openGameProfileEntry.id,
                          name: gameProfileTitle(openGameProfileEntry)
                        })}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => openGameProcessEditor(openGameProfileEntry)}
                      >
                        <IconTargetArrow size={14} />
                        Game Path
                      </button>
                    </div>
                  </section>
                  <div className="overview-card-grid game-detail-nav">
                    {nativeGameFeatures(nativeFeatureMap, openGameProfileEntry)?.triggers ? (
                      <div className="overview-card game-detail-nav-native">
                        <div className="overview-card-title">
                          <span className="feature-icon overview-icon"><IconTargetArrow size={19} /></span>
                          <h3>Adaptive Triggers</h3>
                          <span className="game-tile-chip native on">Native</span>
                        </div>
                        <p className="game-detail-nav-copy">
                          This game drives the triggers itself — custom trigger settings are
                          disabled so they can’t fight the game’s own effects.
                        </p>
                      </div>
                    ) : (
                      <button className="overview-card" type="button" onClick={() => openGameTriggerEditor(openGameProfileEntry)}>
                        <div className="overview-card-title">
                          <span className="feature-icon overview-icon"><IconTargetArrow size={19} /></span>
                          <h3>Adaptive Triggers</h3>
                        </div>
                        <p className="game-detail-nav-copy">
                          {triggerProfileHasEffects(openGameProfileEntry)
                            ? 'Edit this game’s trigger effects and process match.'
                            : 'No trigger effects yet — design some for this game.'}
                        </p>
                      </button>
                    )}
                    <button className="overview-card" type="button" onClick={() => selectControlTab('audio')}>
                      <div className="overview-card-title">
                        <span className="feature-icon overview-icon"><IconVolume size={19} /></span>
                        <h3>Audio</h3>
                      </div>
                      <p className="game-detail-nav-copy">Speaker, microphone and controller audio.</p>
                    </button>
                    <button className="overview-card" type="button" onClick={() => selectControlTab('haptics')}>
                      <div className="overview-card-title">
                        <span className="feature-icon overview-icon"><Sparkles size={19} /></span>
                        <h3>Haptics</h3>
                        {nativeGameFeatures(nativeFeatureMap, openGameProfileEntry)?.haptics && (
                          <span className="game-tile-chip native on">Native</span>
                        )}
                      </div>
                      <p className="game-detail-nav-copy">
                        {nativeGameFeatures(nativeFeatureMap, openGameProfileEntry)?.haptics
                          ? 'This game has native HD haptics — tune intensity and audio-reactive feedback here.'
                          : 'HD haptics, rumble and audio-reactive feedback.'}
                      </p>
                    </button>
                    <button className="overview-card" type="button" onClick={() => selectControlTab('triggers')}>
                      <div className="overview-card-title">
                        <span className="feature-icon overview-icon"><IconDeviceGamepad2 size={19} /></span>
                        <h3>Trigger Lab</h3>
                      </div>
                      <p className="game-detail-nav-copy">Trigger intensity and live effect testing.</p>
                    </button>
                    <button className="overview-card" type="button" onClick={() => selectControlTab('lighting')}>
                      <div className="overview-card-title">
                        <span className="feature-icon overview-icon"><IconBulb size={19} /></span>
                        <h3>Lighting</h3>
                        {nativeGameFeatures(nativeFeatureMap, openGameProfileEntry)?.lightbar && (
                          <span className="game-tile-chip native on">Native</span>
                        )}
                      </div>
                      <p className="game-detail-nav-copy">
                        {nativeGameFeatures(nativeFeatureMap, openGameProfileEntry)?.lightbar
                          ? 'This game syncs the lightbar itself — a lightbar override here would hide its effects.'
                          : 'Lightbar color, brightness and player LEDs.'}
                      </p>
                    </button>
                    <button className="overview-card" type="button" onClick={() => selectControlTab('remapping')}>
                      <div className="overview-card-title">
                        <span className="feature-icon overview-icon"><IconDeviceGamepad3 size={19} /></span>
                        <h3>Button Remapping</h3>
                      </div>
                      <p className="game-detail-nav-copy">This game’s button layout.</p>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <div
            className={`control-page overview-page ${activeControlTab === 'overview' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-overview"
            aria-labelledby="control-tab-overview"
            aria-hidden={activeControlTab !== 'overview'}
          >
            <div className="feature-heading overview-heading">
              <div>
                <h2>Overview</h2>
                <p>At-a-glance status of your controller and active settings.</p>
              </div>
              <span className={`overview-health health-label ${overviewHealthTone}`}>
                <span className={`dot ${overviewHealthTone}`} />
                {overviewHealthLabel}
              </span>
            </div>

            <div className="overview-card-grid">
              <button className="overview-card" type="button" onClick={() => selectControlTab('system')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><Activity size={19} /></span>
                  <h3>Connection</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>USB</span>
                    <strong className={overviewConnectionStatus === 'Stable' ? 'success-value' : ''}>
                      {overviewConnectionStatus}
                    </strong>
                  </div>
                  <div>
                    <span>Polling Rate</span>
                    <strong>{connected && pollingRateControlSupported ? pollingRateLabel : '--'}</strong>
                  </div>
                </div>
              </button>

              <button className="overview-card" type="button" onClick={() => selectControlTab('audio')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><IconBinary size={26} /></span>
                  <h3>Audio Path</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Route</span>
                    <strong className={overviewAudioPathState === 'Bridge Local' ? 'success-value' : ''}>
                      {overviewAudioPathState}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{overviewAudioPathDetail}</strong>
                  </div>
                </div>
              </button>

              <button className="overview-card" type="button" onClick={() => selectControlTab('audio')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><Volume2 size={19} /></span>
                  <h3>Audio</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Route</span>
                    <strong>{overviewAudioOutputLabel}</strong>
                  </div>
                  <div>
                    <span>Volume</span>
                    <strong>{overviewSpeakerVolumeValue}</strong>
                  </div>
                </div>
              </button>

              <button className="overview-card" type="button" onClick={() => selectControlTab('system')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><IconBluetooth size={19} /></span>
                  <h3>Wireless</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Signal</span>
                    <strong className={`signal-value ${overviewSignalTone}`} title={overviewSignalTitle}>
                      {overviewSignalLabel}
                    </strong>
                  </div>
                  <div>
                    <span>Firmware</span>
                    <strong>{overviewFirmwareLabel}</strong>
                  </div>
                </div>
              </button>
            </div>

            <div className="overview-control-grid">
              <section className="overview-control-panel overview-quick-actions" aria-label="Quick actions">
                <div className="overview-panel-heading">
                  <span className="feature-icon overview-icon"><Zap size={18} /></span>
                  <div>
                    <h3>Quick Actions</h3>
                  </div>
                </div>
                <div className="overview-action-grid">
                  <button
                    type="button"
                    disabled={activeFeedbackTestUnavailable}
                    onClick={runFeedbackTest}
                  >
                    <Play size={15} />
                    Test Haptics
                  </button>
                  <button
                    type="button"
                    disabled={testSpeakerUnavailable}
                    onClick={runTestSpeaker}
                  >
                    <Volume2 size={15} />
                    Test Speaker
                  </button>
                  <button
                    type="button"
                    disabled={testMicUnavailable}
                    onClick={runTestMic}
                  >
                    <Mic size={15} />
                    Listen Mic
                  </button>
                  <button
                    type="button"
                    className={overviewSleepConfirmVisible ? 'confirm' : undefined}
                    disabled={!connected || !sleepControllerSupported || !controllerConnected || pendingAction !== null}
                    onClick={handleOverviewSleepController}
                  >
                    <Moon size={15} />
                    {overviewSleepConfirmVisible ? 'Confirm Sleep' : 'Sleep Controller'}
                  </button>
                </div>
                <div className="overview-persona-grid" aria-label="Host controller persona">
                  {HOST_PERSONA_OPTIONS.map(([label, mode]) => {
                    const active = overviewHostPersonaMode === mode;
                    const supported = supportedHostPersonaModes.includes(mode);
                    const disabled = !connected
                      || !hostPersonaControlSupported
                      || pendingAction !== null
                      || personaTransitionActive
                      || (!supported && !active);
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={`overview-persona-button persona-${mode} ${active ? 'active' : ''}`}
                        aria-pressed={active}
                        disabled={disabled}
                        title={`Switch to ${label} mode`}
                        onClick={() => {
                          if (!active) {
                            setHostPersonaMode(mode);
                          }
                        }}
                      >
                        {mode === 'xbox' ? (
                          <IconBrandXbox className="overview-persona-logo" aria-hidden="true" />
                        ) : (
                          <span
                            className="overview-persona-logo playstation"
                            style={{ '--overview-persona-logo-mask': `url("${playStationLogoUrl}")` } as CSSProperties}
                            aria-hidden="true"
                          />
                        )}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="overview-control-panel overview-sliders" aria-label="Quick controls">
                <div className="overview-panel-heading">
                  <span className="feature-icon overview-icon"><IconAdjustmentsSpark size={18} /></span>
                  <div>
                    <h3>Quick Controls</h3>
                  </div>
                  <div className="overview-heading-toggle">
                    <span>Touchpad Mouse</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={snapshot.settings.touchpadMouseEnabled}
                      className={`switch ${snapshot.settings.touchpadMouseEnabled ? 'on' : ''}`}
                      disabled={!connected || pendingAction !== null}
                      onClick={() => void runAction('touchpad-mouse', () => (
                        window.bridge.setTouchpadMouseEnabled(!snapshot.settings.touchpadMouseEnabled)
                      ))}
                    >
                      <span />
                    </button>
                  </div>
                </div>
                <div className="overview-slider-list">
                  <label className={`overview-slider-row ${(!connected || !snapshot.settings.hapticsEnabled) ? 'disabled' : ''}`}>
                    <span>HD Haptics</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max={hapticsSliderMax}
                        step={HAPTICS_STEP}
                        value={hapticsValue}
                        disabled={!connected || !snapshot.settings.hapticsEnabled}
                        style={{ '--range-fill': `${(hapticsValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                        onPointerDown={() => {
                          hapticsEditingRef.current = true;
                        }}
                        onChange={(event) => setHapticsValue(snapHapticsValue(
                          Number(event.currentTarget.value),
                          hapticsSliderMax
                        ))}
                        onPointerUp={() => void commitHapticsValue()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            hapticsEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void commitHapticsValue();
                          }
                        }}
                        onBlur={() => void commitHapticsValue()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {hapticsSliderTicks.map((value) => (
                          <span key={value} className={sliderTickClass(value, hapticsSliderMax)} />
                        ))}
                      </div>
                    </div>
                    <strong>{hapticsValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || speakerVolumeCommitPending) ? 'disabled' : ''}`}>
                    <span>Speaker</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step={SPEAKER_VOLUME_STEP}
                        value={speakerVolumeValue}
                        disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || speakerVolumeCommitPending}
                        style={{ '--range-fill': `${speakerVolumeValue}%` } as CSSProperties}
                        onPointerDown={() => {
                          speakerVolumeEditingRef.current = true;
                        }}
                        onChange={(event) => setSpeakerVolumeValue(snapSpeakerVolume(Number(event.currentTarget.value)))}
                        onPointerUp={() => void commitSpeakerVolume()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            speakerVolumeEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void commitSpeakerVolume();
                          }
                        }}
                        onBlur={() => void commitSpeakerVolume()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{speakerVolumeValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !duplexMicEnabled || micVolumeCommitPending) ? 'disabled' : ''}`}>
                    <span>Mic</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step={MIC_VOLUME_STEP}
                        value={micVolumeValue}
                        disabled={!connected || !duplexMicEnabled || micVolumeCommitPending}
                        style={{ '--range-fill': `${micVolumeValue}%` } as CSSProperties}
                        onPointerDown={() => {
                          micVolumeEditingRef.current = true;
                        }}
                        onChange={(event) => setMicVolumeValue(snapMicVolume(Number(event.currentTarget.value)))}
                        onPointerUp={() => void commitMicVolume()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            micVolumeEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void commitMicVolume();
                          }
                        }}
                        onBlur={() => void commitMicVolume()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{micVolumeValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled || lightbarCommitPending) ? 'disabled' : ''}`}>
                    <span>Lightbar</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max={percentSliderMax}
                        step={LIGHTBAR_BRIGHTNESS_STEP}
                        value={lightbarBrightnessValue}
                        disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled || lightbarCommitPending}
                        style={{ '--range-fill': `${(lightbarBrightnessValue / percentSliderMax) * 100}%` } as CSSProperties}
                        onPointerDown={() => {
                          lightbarBrightnessEditingRef.current = true;
                        }}
                        onChange={(event) => setLightbarBrightnessValue(snapLightbarBrightness(Number(event.currentTarget.value)))}
                        onPointerUp={() => void commitLightbar()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            lightbarBrightnessEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void commitLightbar();
                          }
                        }}
                        onBlur={() => void commitLightbar()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{lightbarBrightnessValue}%</strong>
                  </label>
                </div>
              </section>
            </div>

            <section className="overview-status-panel" aria-label="Active settings summary">
              <div className="overview-status-group">
                <div className="overview-status-heading">
                  <IconDeviceGamepad2 size={15} />
                  <span>Shortcuts</span>
                </div>
                <div className="overview-chip-row">
                  {overviewShortcutItems.length > 0 ? (
                    overviewShortcutItems.map((item) => (
                      <button
                        className="overview-chip overview-shortcut-chip active"
                        key={item.id}
                        type="button"
                        onClick={() => focusBridgeSettings(item.id === 'sleep' ? 'sleep-shortcut' : 'volume-shortcut')}
                      >
                        {item.label}
                        {item.id === 'sleep' ? (
                          <span className="settings-shortcut-tooltip shortcut-glyph-tooltip overview-shortcut-tooltip" role="tooltip">
                            <span>Put controller to sleep with</span>
                            <span className="shortcut-glyph-row" aria-label="PlayStation Home and Triangle">
                              <span className="shortcut-glyph-key">
                                <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                              </span>
                              <span className="shortcut-plus" aria-hidden="true">+</span>
                              <span className="shortcut-glyph-key">
                                <img src={triangleGlyphUrl} alt="Triangle" />
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="settings-shortcut-tooltip shortcut-glyph-tooltip overview-shortcut-tooltip" role="tooltip">
                            <span>Controller volume up/down with</span>
                            <span className="shortcut-glyph-row" aria-label="PlayStation Home and D-pad Up or D-pad Down">
                              <span className="shortcut-glyph-key">
                                <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                              </span>
                              <span className="shortcut-plus" aria-hidden="true">+</span>
                              <span className="shortcut-glyph-pair">
                                <span className="shortcut-glyph-key">
                                  <img src={dpadUpGlyphUrl} alt="D-pad Up" />
                                </span>
                                <span className="shortcut-glyph-key">
                                  <img src={dpadDownGlyphUrl} alt="D-pad Down" />
                                </span>
                              </span>
                            </span>
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <span className="overview-chip muted">None enabled</span>
                  )}
                </div>
              </div>
              <div className="overview-status-group">
                <div className="overview-status-heading">
                  <IconBatteryEco size={15} />
                  <span>Power Saving</span>
                </div>
                <div className="overview-chip-row">
                  <button
                    className={`overview-chip ${snapshot.settings.controllerPowerSavingEnabled ? 'active success' : 'muted'}`}
                    type="button"
                    onClick={() => focusBridgeSettings('controller-power-saving')}
                  >
                    {overviewPowerSavingLabel}
                  </button>
                </div>
              </div>
              <div className="overview-status-group">
                <div className="overview-status-heading">
                  <Bell size={15} />
                  <span>Notifications</span>
                </div>
                <div className="overview-chip-row">
                  {overviewNotificationItems.length > 0 ? (
                    overviewNotificationItems.map((item) => (
                      <button
                        className="overview-chip active"
                        key={item.id}
                        type="button"
                        onClick={() => focusNotificationSettings(item.id)}
                      >
                        {item.label}
                      </button>
                    ))
                  ) : (
                    <button
                      className="overview-chip muted"
                      type="button"
                      onClick={() => focusNotificationSettings('all')}
                    >
                      Off
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div
            className={`control-page haptics-page ${activeControlTab === 'haptics' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-haptics"
            aria-labelledby="control-tab-haptics"
            aria-hidden={activeControlTab !== 'haptics'}
          >
              <div className="feature-heading">
                <div>
                  <h2>{audioHapticsOpen ? 'Audio Haptics' : showClassicRumbleControl ? 'Rumble' : 'HD Haptics'}</h2>
                  <p>{audioHapticsOpen ? 'Turn system audio into haptic feedback.' : 'Adjust controller haptic feedback and run a quick test.'}</p>
                </div>
                <div className="audio-heading-controls">
                  <div className="inline-switch audio-haptics-switch-control">
                    {audioReactiveHapticsModeBadgeLabel ? (
                      <span className={`inline-state-badge audio-haptics-mode-state ${audioReactiveHapticsOverrideMode ? 'warn' : 'retry'}`}>
                        {audioReactiveHapticsModeBadgeLabel}
                      </span>
                    ) : null}
                    <span>Audio Haptics</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={audioReactiveHapticsEnabled}
                      aria-label={audioReactiveHapticsEnabled ? 'Disable Audio Haptics' : 'Enable Audio Haptics'}
                      className={`switch audio-haptics-switch ${audioReactiveHapticsEnabled ? 'on' : ''}`}
                      disabled={audioReactiveHapticsControlDisabled}
                      onClick={toggleAudioHapticsFeature}
                    >
                      <span />
                    </button>
                    {audioReactiveHapticsModeBadgeLabel ? (
                      <span className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-haptics-mode-tooltip">
                        {audioReactiveHapticsModeTooltip}
                      </span>
                    ) : null}
                  </div>
                  <div className="inline-switch">
                    <span>Enabled</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={activeHapticsFeatureEnabled}
                      className={`switch ${activeHapticsFeatureEnabled ? 'on' : ''}`}
                      disabled={!controllerControlsAvailable || pendingAction !== null}
                      onClick={showClassicRumbleControl ? toggleClassicRumbleEnabled : toggleHapticsEnabled}
                    >
                      <span />
                    </button>
                  </div>
                </div>
              </div>
              {audioHapticsOpen ? (
                <div className="feature-card-grid audio-haptics-grid">
                  <section className="feature-card audio-haptics-card">
                    <div className="feature-card-title">
                      <button
                        type="button"
                        className={`feature-icon audio-haptics-enable-button icon-compact ${audioReactiveHapticsEnabled ? 'active' : ''}`}
                        aria-pressed={audioReactiveHapticsEnabled}
                        aria-label={audioReactiveHapticsEnabled ? 'Disable audio haptics' : 'Enable audio haptics'}
                        title={audioReactiveHapticsStatusLabel}
                        disabled={audioReactiveHapticsControlDisabled}
                        onClick={toggleAudioReactiveHapticsEnabled}
                      >
                        <IconDeviceAudioTape size={20} />
                      </button>
                      <div className="title-copy">
                        <h3>Audio Haptics</h3>
                        <p>System audio feedback</p>
                      </div>
                    </div>
                    <div className="framed-slider">
                      <label className="slider-row">
                        <span>0%</span>
                        <div className="range-control">
                          <input
                            type="range"
                            min="0"
                            max={hapticsSliderMax}
                            step={HAPTICS_STEP}
                            value={hapticsValue}
                            disabled={!connected || !snapshot.settings.hapticsEnabled || hapticsCommitPending}
                            style={{ '--range-fill': `${(hapticsValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                            aria-label="Haptics gain"
                            onPointerDown={() => {
                              hapticsEditingRef.current = true;
                            }}
                            onChange={(event) => setHapticsValue(snapHapticsValue(
                              Number(event.currentTarget.value),
                              hapticsSliderMax
                            ))}
                            onPointerUp={() => void commitHapticsValue()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                hapticsEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitHapticsValue();
                              }
                            }}
                            onBlur={() => void commitHapticsValue()}
                          />
                          <div className="range-ticks" aria-hidden="true">
                            {hapticsSliderTicks.map((value) => (
                              <span key={value} className={sliderTickClass(value, hapticsSliderMax)} />
                            ))}
                          </div>
                        </div>
                        <strong>{hapticsValue}%</strong>
                      </label>
                    </div>
                    <span className="audio-haptics-slider-spacer" aria-hidden="true" />
                    <div className="segmented-row">
                      {HAPTICS_PRESETS.map(([label, value]) => {
                        const presetValue = snapHapticsValue(Number(value), hapticsSliderMax);
                        return (
                          <button
                            key={label}
                            type="button"
                            className={hapticsValue === presetValue ? 'active' : ''}
                            disabled={!connected || !snapshot.settings.hapticsEnabled || hapticsCommitPending}
                            onClick={() => setHapticsPreset(presetValue)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="audio-haptics-routing-stack">
                      <label className="audio-haptics-source-field">
                        <CustomSelect
                          value={audioReactiveHapticsSourceKey}
                          options={audioHapticsSourceOptions}
                          disabled={audioReactiveHapticsConfigDisabled}
                          className="audio-haptics-source-select"
                          ariaLabel="Audio haptics source"
                          renderValue={(label, value) => (
                            <AudioHapticsSourceOption
                              label={label}
                              value={value}
                              session={audioHapticsSessionByKey.get(value)}
                              loading={audioHapticsSessionsLoading}
                            />
                          )}
                          renderOption={(label, value) => (
                            <AudioHapticsSourceOption
                              label={label}
                              value={value}
                              session={audioHapticsSessionByKey.get(value)}
                              loading={audioHapticsSessionsLoading}
                            />
                          )}
                          onChange={setAudioReactiveHapticsSourceValue}
                        />
                      </label>
                      <div className="dual-selector audio-haptics-mode-selector" role="tablist" aria-label="Audio haptics mode">
                        {AUDIO_REACTIVE_HAPTICS_MODE_OPTIONS.map(([label, mode]) => (
                          <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={snapshot.settings.audioReactiveHapticsMode === mode}
                            className={snapshot.settings.audioReactiveHapticsMode === mode ? 'active' : ''}
                            disabled={audioReactiveHapticsConfigDisabled}
                            onClick={() => setAudioReactiveHapticsMode(mode)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                  <section className="feature-card audio-haptics-card audio-haptics-response-card">
                    <div className="feature-card-title">
                      <span className="feature-icon"><IconBrandDeezer size={20} /></span>
                      <div className="title-copy">
                        <h3>Response</h3>
                        <p>Frequency focus and strength</p>
                      </div>
                    </div>
                    <div className="audio-haptics-config-stack">
                      <div className="audio-haptics-config-pair-row">
                        <label>
                          <AudioHapticsConfigLabel
                            id="audio-haptics-bass-focus-tooltip"
                            label="Bass Focus"
                            tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.bassFocus}
                          />
                          <CustomSelect
                            value={snapshot.settings.audioReactiveHapticsBassFocus}
                            options={AUDIO_REACTIVE_HAPTICS_BASS_FOCUS_OPTIONS}
                            disabled={audioReactiveHapticsConfigDisabled}
                            className="audio-haptics-select"
                            ariaLabel="Audio haptics bass focus"
                            onChange={setAudioReactiveHapticsBassFocus}
                          />
                        </label>
                        <label>
                          <AudioHapticsConfigLabel
                            id="audio-haptics-response-tooltip"
                            label="Response"
                            tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.response}
                          />
                          <CustomSelect
                            value={snapshot.settings.audioReactiveHapticsResponse}
                            options={AUDIO_REACTIVE_HAPTICS_RESPONSE_OPTIONS}
                            disabled={audioReactiveHapticsConfigDisabled}
                            className="audio-haptics-select"
                            ariaLabel="Audio haptics response"
                            onChange={setAudioReactiveHapticsResponse}
                          />
                        </label>
                      </div>
                      <div className="audio-haptics-config-pair-row">
                        <label>
                          <AudioHapticsConfigLabel
                            id="audio-haptics-attack-tooltip"
                            label="Ramp"
                            tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.attack}
                          />
                          <CustomSelect
                            value={snapshot.settings.audioReactiveHapticsAttack}
                            options={AUDIO_REACTIVE_HAPTICS_ATTACK_OPTIONS}
                            disabled={audioReactiveHapticsConfigDisabled}
                            className="audio-haptics-select"
                            ariaLabel="Audio haptics attack"
                            onChange={setAudioReactiveHapticsAttack}
                          />
                        </label>
                        <label>
                          <AudioHapticsConfigLabel
                            id="audio-haptics-release-tooltip"
                            label="Fade"
                            tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.release}
                          />
                          <CustomSelect
                            value={snapshot.settings.audioReactiveHapticsRelease}
                            options={AUDIO_REACTIVE_HAPTICS_RELEASE_OPTIONS}
                            disabled={audioReactiveHapticsConfigDisabled}
                            className="audio-haptics-select"
                            ariaLabel="Audio haptics release"
                            onChange={setAudioReactiveHapticsRelease}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="feature-status test-status audio-haptics-status">
                      <span className={`status-badge ${audioReactiveHapticsStatusTone}`} title={audioReactiveHapticsStatusLabel}>
                        <span className={`dot ${audioReactiveHapticsStatusTone}`} />
                        <strong>{audioReactiveHapticsStatusLabel}</strong>
                      </span>
                      <span className={`status-badge ${audioReactiveHapticsStatusTone}`} title={audioReactiveHapticsSourceKey === 'system-audio' ? 'Using the mixed Windows output.' : 'Using the selected app audio session.'}>
                        <span className={`dot ${audioReactiveHapticsEnabled ? audioReactiveHapticsStatusTone : 'idle'}`} />
                        <strong>{selectedAudioHapticsSourceDisplayName}</strong>
                      </span>
                    </div>
                  </section>
                </div>
              ) : (
              <div className="feature-card-grid">
                <section className="feature-card preset-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon haptics-enable-button ${showClassicRumbleControl ? 'icon-medium' : 'icon-compact'} ${activeHapticsFeatureEnabled ? 'active' : ''} ${controllerPowerSavingActive && activeHapticsFeatureEnabled ? 'power-saving-active' : ''}`}
                      aria-pressed={activeHapticsFeatureEnabled}
                      aria-label={showClassicRumbleControl ? 'Enable rumble' : 'Enable HD haptics'}
                      title={showClassicRumbleControl ? 'Enable rumble' : 'Enable HD haptics'}
                      disabled={!controllerControlsAvailable || pendingAction !== null}
                      onClick={showClassicRumbleControl ? toggleClassicRumbleEnabled : toggleHapticsEnabled}
                    >
                      {showClassicRumbleControl ? <Vibrate size={20} /> : <Sparkles size={20} />}
                    </button>
                    <div className="title-copy">
                      <h3>{showClassicRumbleControl ? 'Rumble' : 'Intensity'}</h3>
                      <p>{showClassicRumbleControl ? 'Rumble Strength' : 'Haptic Strength'}</p>
                    </div>
                    <div className="dual-selector haptics-mode-selector" role="tablist" aria-label="Haptics control mode">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!showClassicRumbleControl}
                        className={!showClassicRumbleControl ? 'active' : ''}
                        onClick={() => setShowClassicRumbleControl(false)}
                      >
                        HD Haptics
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={showClassicRumbleControl}
                        className={showClassicRumbleControl ? 'active' : ''}
                        onClick={() => setShowClassicRumbleControl(true)}
                      >
                        Rumble
                      </button>
                    </div>
                  </div>
                  <div className="framed-slider">
                    <label className="slider-row">
                      <span>0%</span>
                      <div className="range-control">
                        {showClassicRumbleControl ? (
                          <input
                            type="range"
                            min="0"
                            max={hapticsSliderMax}
                            step={HAPTICS_STEP}
                            value={classicRumbleValue}
                            disabled={!connected || !snapshot.settings.classicRumbleEnabled}
                            style={{ '--range-fill': `${(classicRumbleValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                            onPointerDown={() => {
                              classicRumbleEditingRef.current = true;
                            }}
                            onChange={(event) => setClassicRumbleValue(snapHapticsValue(
                              Number(event.currentTarget.value),
                              hapticsSliderMax
                            ))}
                            onPointerUp={() => void commitClassicRumbleValue()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                classicRumbleEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitClassicRumbleValue();
                              }
                            }}
                            onBlur={() => void commitClassicRumbleValue()}
                          />
                        ) : (
                          <input
                            type="range"
                            min="0"
                            max={hapticsSliderMax}
                            step={HAPTICS_STEP}
                            value={hapticsValue}
                            disabled={!connected || !snapshot.settings.hapticsEnabled}
                            style={{ '--range-fill': `${(hapticsValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                            onPointerDown={() => {
                              hapticsEditingRef.current = true;
                            }}
                            onChange={(event) => setHapticsValue(snapHapticsValue(
                              Number(event.currentTarget.value),
                              hapticsSliderMax
                            ))}
                            onPointerUp={() => void commitHapticsValue()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                hapticsEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitHapticsValue();
                              }
                            }}
                            onBlur={() => void commitHapticsValue()}
                          />
                        )}
                        <div className="range-ticks" aria-hidden="true">
                          {hapticsSliderTicks.map((value) => (
                            <span key={value} className={sliderTickClass(value, hapticsSliderMax)} />
                          ))}
                        </div>
                      </div>
                      <strong>{showClassicRumbleControl ? classicRumbleValue : hapticsValue}%</strong>
                    </label>
                  </div>
                  <div className="segmented-row">
                    {HAPTICS_PRESETS.map(([label, value]) => {
                      const presetValue = snapHapticsValue(Number(value), hapticsSliderMax);
                      const currentValue = showClassicRumbleControl ? classicRumbleValue : hapticsValue;
                      return (
                        <button
                          key={label}
                          type="button"
                          className={currentValue === presetValue ? 'active' : ''}
                          disabled={
                            !connected
                            || (showClassicRumbleControl ? !snapshot.settings.classicRumbleEnabled : !snapshot.settings.hapticsEnabled)
                          }
                          onClick={() => (
                            showClassicRumbleControl
                              ? setClassicRumblePreset(presetValue)
                              : setHapticsPreset(presetValue)
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="inline-switch feedback-boost-control haptics-boost-control"
                    title={feedbackBoostEnabled ? 'Feedback boost: up to 500%' : 'Enable feedback boost up to 500%'}
                  >
                    <span className="feedback-boost-label">
                      <IconFlame size={16} aria-hidden="true" />
                      Boost
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={feedbackBoostEnabled}
                      aria-label={feedbackBoostEnabled ? 'Disable feedback boost' : 'Enable feedback boost'}
                      className={`switch ${feedbackBoostEnabled ? 'on' : ''}`}
                      disabled={!connected || pendingAction !== null || feedbackBoostCommitPending}
                      onClick={toggleFeedbackBoostEnabled}
                    >
                      <span />
                    </button>
                  </div>
                  {showClassicRumbleControl ? (
                    <div
                      className="inline-switch feedback-boost-control haptics-rumble-v1-control"
                      title={classicRumbleV1Enabled ? 'Classic rumble: v1 compatibility mode' : 'Classic rumble: v2 default mode'}
                    >
                      <span className="feedback-boost-label">v1 Rumble</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={classicRumbleV1Enabled}
                        aria-label={classicRumbleV1Enabled ? 'Disable v1 rumble mode' : 'Enable v1 rumble mode'}
                        className={`switch ${classicRumbleV1Enabled ? 'on' : ''}`}
                        disabled={!connected || pendingAction !== null || classicRumbleV1CommitPending}
                        onClick={toggleClassicRumbleV1Enabled}
                      >
                        <span />
                      </button>
                    </div>
                  ) : null}
                </section>
                <section className="feature-card test-card">
                  <div className="feature-card-title">
                    <span className="feature-icon"><IconTestPipe size={20} /></span>
                    <div className="title-copy">
                      <h3>Testing</h3>
                      <p>Run a short test to feel the current settings.</p>
                    </div>
                  </div>
                  <button className="primary-action" type="button" disabled={activeFeedbackTestUnavailable} onClick={runFeedbackTest}>
                    <Play size={15} />
                    {showClassicRumbleControl
                      ? connected && testLocked
                        ? 'Testing'
                        : 'Test Rumble'
                    : connected && testLocked
                        ? 'Testing'
                      : connected && snapshot.status?.testHapticsCooldown
                        ? 'Cooling Down'
                        : 'Test Haptics'}
                  </button>
                  <button className="secondary-action" type="button" disabled={!testLocked} onClick={() => setTestLocked(false)}>
                    <span className="stop-glyph" aria-hidden="true" />
                    Stop Test
                  </button>
                  <div className={`feature-status test-status ${activeFeedbackStatusTone}`}>
                    <span className="status-badge">
                      <span className={`dot ${activeFeedbackStatusTone}`} />
                      <strong>{activeFeedbackStatusLabel}</strong>
                    </span>
                  </div>
                </section>
              </div>
              )}
              <FeatureTipsPanel tab="haptics" onSettingsFocusRequest={focusBridgeSettings} audioHapticsOpen={audioHapticsOpen} />
          </div>

          <div
            className={`control-page audio-page ${activeControlTab === 'audio' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-audio"
            aria-labelledby="control-tab-audio"
            aria-hidden={activeControlTab !== 'audio'}
          >
              <div className="feature-heading">
                <div>
                  <h2>Audio</h2>
                  <p>{`Adjust controller ${outputControlLower} and microphone levels.`}</p>
                </div>
                <div className="audio-heading-actions">
                  <div className="chords-field chords-inline-field audio-speaker-gain-field">
                    <span>Speaker Gain</span>
                    <CustomSelect
                      value={speakerGainLevel}
                      options={SPEAKER_GAIN_OPTIONS}
                      disabled={!controllerControlsAvailable || !speakerVolumeSupported || pendingAction !== null}
                      ariaLabel="Speaker gain"
                      className="audio-speaker-gain-select"
                      closeOnSelect={true}
                      onChange={setSpeakerGainLevel}
                      renderValue={(_label, value) => (
                        <span>{value}</span>
                      )}
                      renderOption={(label) => (
                        <span className="speaker-gain-option">
                          <strong>{label}</strong>
                        </span>
                      )}
                    />
                  </div>
                  <div className="audio-heading-controls">
                    <div className="inline-switch">
                      <span>Enabled</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={audioEnabled}
                        aria-label="Enable audio"
                        className={`switch ${audioEnabled ? 'on' : ''}`}
                        disabled={!controllerControlsAvailable || pendingAction !== null}
                        onClick={toggleAudioEnabled}
                      >
                        <span />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="feature-card-grid">
                <section className="feature-card preset-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon audio-enable-button icon-medium ${
                        showMicrophoneControl
                          ? duplexMicEnabled
                            ? 'active'
                            : ''
                          : snapshot.settings.speakerEnabled
                            ? 'active'
                            : ''
                      }`}
                      aria-pressed={showMicrophoneControl ? duplexMicEnabled : snapshot.settings.speakerEnabled}
                      aria-label={showMicrophoneControl ? duplexMicLabel : `Enable controller ${outputControlLower}`}
                      title={showMicrophoneControl ? duplexMicLabel : `Enable controller ${outputControlLower}`}
                      disabled={
                        showMicrophoneControl
                          ? !controllerControlsAvailable || pendingAction !== null
                          : !controllerControlsAvailable || !speakerVolumeSupported || pendingAction !== null
                      }
                      onClick={showMicrophoneControl ? toggleDuplexMicEnabled : toggleSpeakerEnabled}
                    >
                      {showMicrophoneControl ? <Mic size={20} /> : <OutputIcon size={20} />}
                    </button>
                    <div className="title-copy">
                      <h3>{showMicrophoneControl ? 'Microphone' : outputControlLabel}</h3>
                      <p>
                        {showMicrophoneControl
                          ? 'Microphone level'
                          : `${outputControlLabel} level`}
                      </p>
                    </div>
                    <div className="dual-selector audio-mode-selector" role="tablist" aria-label="Audio control mode">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!showMicrophoneControl}
                        className={!showMicrophoneControl ? 'active' : ''}
                        onClick={() => setShowMicrophoneControl(false)}
                      >
                        {outputControlLabel}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={showMicrophoneControl}
                        className={showMicrophoneControl ? 'active' : ''}
                        onClick={() => setShowMicrophoneControl(true)}
                      >
                        Mic
                      </button>
                    </div>
                  </div>
                  <div className="framed-slider">
                    <label className="slider-row">
                      <span>0%</span>
                      <div className="range-control">
                        {showMicrophoneControl ? (
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step={MIC_VOLUME_STEP}
                            value={micVolumeValue}
                            disabled={!connected || !duplexMicEnabled || micVolumeCommitPending}
                            style={{ '--range-fill': `${micVolumeValue}%` } as CSSProperties}
                            aria-label="Microphone level"
                            onPointerDown={() => {
                              micVolumeEditingRef.current = true;
                            }}
                            onChange={(event) => setMicVolumeValue(snapMicVolume(Number(event.currentTarget.value)))}
                            onPointerUp={() => void commitMicVolume()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                micVolumeEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitMicVolume();
                              }
                            }}
                            onBlur={() => void commitMicVolume()}
                          />
                        ) : (
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step={SPEAKER_VOLUME_STEP}
                            value={speakerVolumeValue}
                            disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled}
                            style={{ '--range-fill': `${speakerVolumeValue}%` } as CSSProperties}
                            onPointerDown={() => {
                              speakerVolumeEditingRef.current = true;
                            }}
                            onChange={(event) => setSpeakerVolumeValue(snapSpeakerVolume(Number(event.currentTarget.value)))}
                            onPointerUp={() => void commitSpeakerVolume()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                speakerVolumeEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitSpeakerVolume();
                              }
                            }}
                            onBlur={() => void commitSpeakerVolume()}
                          />
                        )}
                        <div className="range-ticks" aria-hidden="true">
                          {PERCENT_SLIDER_TICKS.map((value) => (
                            <span key={value} className={sliderTickClass(value, 100)} />
                          ))}
                        </div>
                      </div>
                      <strong>{showMicrophoneControl ? micVolumeValue : speakerVolumeValue}%</strong>
                    </label>
                  </div>
                  {showMicrophoneControl ? (
                    <>
                      <div className="segmented-row">
                        {MIC_VOLUME_PRESETS.map(([label, value]) => (
                          <button
                            key={label}
                            type="button"
                            className={micVolumeValue === value ? 'active' : ''}
                            disabled={!connected || !duplexMicEnabled || micVolumeCommitPending}
                            onClick={() => setMicPreset(Number(value))}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="mic-option-grid">
                        <button
                          type="button"
                          className={snapshot.settings.micMuted ? 'active danger' : ''}
                          aria-pressed={snapshot.settings.micMuted}
                          disabled={!connected || !duplexMicEnabled || pendingAction !== null}
                          onClick={toggleMicMute}
                        >
                          <VolumeX size={15} />
                          Mute
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="segmented-row">
                        {SPEAKER_VOLUME_PRESETS.map(([label, value]) => (
                          <button
                            key={label}
                            type="button"
                            className={speakerVolumeValue === value ? 'active' : ''}
                            disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || speakerVolumeCommitPending}
                            onClick={() => setSpeakerPreset(Number(value))}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="audio-secondary-controls">
                        <div
                          className={`audio-buffer-control framed-slider ${audioBufferLengthControlDisabled ? 'disabled' : ''}`}
                          style={{ '--range-fill': `${audioBufferPercent(audioBufferLengthValue)}%` } as CSSProperties}
                        >
                          <div className="audio-buffer-header">
                            <AudioHapticsConfigLabel
                              id="audio-buffer-length-tooltip"
                              label="Audio Buffer Length"
                              tooltip="Sets the DualSense audio buffer value. Lower values reduce haptic delay but increase stutter risk; higher values improve speaker stability at the cost of latency."
                              className="audio-buffer-title"
                            />
                            <div className="audio-buffer-readout">
                              <strong>{audioBufferLengthValue}</strong>
                              <span>{audioBufferDelayLabel(audioBufferLengthValue)}</span>
                            </div>
                            <div
                              className={`audio-buffer-status-icon ${audioBufferZoneTone(audioBufferLengthValue)}`}
                              aria-label={audioBufferZoneLabel(audioBufferLengthValue)}
                              aria-describedby="audio-buffer-zone-tooltip"
                              tabIndex={0}
                            >
                              {audioBufferZoneTone(audioBufferLengthValue) === 'safe' && (
                                <IconCircleCheck size={18} stroke={2.35} aria-hidden="true" />
                              )}
                              {audioBufferZoneTone(audioBufferLengthValue) === 'risky' && (
                                <IconAlertTriangle size={18} stroke={2.35} aria-hidden="true" />
                              )}
                              {audioBufferZoneTone(audioBufferLengthValue) === 'stutter' && (
                                <IconAlertHexagon size={18} stroke={2.35} aria-hidden="true" />
                              )}
                              <span
                                id="audio-buffer-zone-tooltip"
                                className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-buffer-zone-tooltip"
                                role="tooltip"
                              >
                                {audioBufferZoneTooltip(audioBufferLengthValue)}
                              </span>
                            </div>
                          </div>
                          <label className="audio-slider-row audio-buffer-slider-row">
                            <div className="range-control audio-buffer-range-control">
                              <input
                                type="range"
                                min={AUDIO_BUFFER_LENGTH_MIN}
                                max={AUDIO_BUFFER_LENGTH_MAX}
                                step="1"
                                value={audioBufferLengthValue}
                                aria-label="Audio buffer length"
                                aria-valuetext={`${audioBufferLengthValue}, ${audioBufferDelayLabel(audioBufferLengthValue)}, ${audioBufferZoneLabel(audioBufferLengthValue)}`}
                                disabled={audioBufferLengthControlDisabled}
                                onPointerDown={() => {
                                  audioBufferLengthEditingRef.current = true;
                                }}
                                onPointerCancel={() => void commitAudioBufferLength()}
                                onChange={(event) => {
                                  audioBufferLengthEditingRef.current = true;
                                  setAudioBufferLengthValue(clampAudioBufferLength(Number(event.currentTarget.value)));
                                }}
                                onPointerUp={() => void commitAudioBufferLength()}
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                    audioBufferLengthEditingRef.current = true;
                                  }
                                }}
                                onKeyUp={(event) => {
                                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                    void commitAudioBufferLength();
                                  }
                                }}
                                onBlur={() => void commitAudioBufferLength()}
                              />
                            </div>
                          </label>
                        </div>
                      </div>
                    </>
                  )}
                </section>
                <section className="feature-card test-card">
                  <div className="feature-card-title">
                    <span className="feature-icon"><IconTestPipe size={20} /></span>
                    <div className="title-copy">
                      <h3>Testing</h3>
                      <p>{showMicrophoneControl ? 'Listen to the controller microphone for five seconds.' : `Play a short sample through the controller ${outputControlLower}.`}</p>
                    </div>
                  </div>
                  <button
                    className="primary-action"
                    type="button"
                    disabled={activeAudioTestUnavailable}
                    onClick={showMicrophoneControl ? runTestMic : runTestSpeaker}
                  >
                    {showMicrophoneControl ? <Mic size={15} /> : <Play size={15} />}
                    {showMicrophoneControl
                      ? connected && micTestLocked
                        ? 'Live Listening'
                        : connected && micTestError
                          ? 'Retry Mic'
                          : 'Test Mic'
                      : connected && speakerTestLocked
                        ? 'Playing Tone'
                        : connected && gameStreamActive
                          ? 'Game Active'
                        : connected && speakerOutputMissing
                            ? `Retry ${outputControlLabel}`
                          : `Test ${outputControlLabel}`}
                  </button>
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={!activeAudioTestLocked}
                    onClick={showMicrophoneControl ? stopMicLiveListen : () => setSpeakerTestLocked(false)}
                  >
                    <span className="stop-glyph" aria-hidden="true" />
                    Stop Test
                  </button>
                  <div className="feature-status test-status audio-test-status">
                    <span className={`status-badge ${activeAudioTestStatusTone}`} title={activeAudioTestStatusLabel}>
                      <span className={`dot ${activeAudioTestStatusTone}`} />
                      <strong>{activeAudioTestStatusLabel}</strong>
                    </span>
                    <span className={`status-badge ${audioPathTone}`} title={audioPathTooltip}>
                      <span className={`dot ${audioPathTone}`} />
                      <strong>{audioPathLabel}</strong>
                    </span>
                  </div>
                </section>
              </div>
              <FeatureTipsPanel tab="audio" />
          </div>

          <div
            className={`control-page triggers-page ${activeControlTab === 'triggers' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-triggers"
            aria-labelledby="control-tab-triggers"
            aria-hidden={activeControlTab !== 'triggers'}
          >
              <div className="feature-heading">
                <div>
                  <h2>Adaptive Triggers</h2>
                  <p>Set the strength of adaptive trigger effects</p>
                </div>
                <div className="triggers-heading-controls">
                  {/* Rarely needed, but it is the way out when a game quits without releasing
                      the triggers and leaves an effect held on them. */}
                  <button
                    className="secondary-action triggers-reset-button"
                    type="button"
                    title="Clear any effect currently held on the triggers"
                    disabled={!connected || !adaptiveTriggersSupported || adaptiveTriggerOutputActive || pendingAction !== null}
                    onClick={resetAdaptiveTriggers}
                  >
                    <RefreshCcw size={14} />
                    Reset
                  </button>
                  <div className="inline-switch">
                    <span>Enabled</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={snapshot.settings.adaptiveTriggersEnabled}
                      className={`switch ${snapshot.settings.adaptiveTriggersEnabled ? 'on' : ''}`}
                      disabled={!controllerControlsAvailable || !adaptiveTriggersSupported || pendingAction !== null}
                      onClick={toggleAdaptiveTriggersEnabled}
                    >
                      <span />
                    </button>
                  </div>
                </div>
              </div>
              <div className="feature-card-grid">
                <section className="feature-card preset-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon triggers-enable-button icon-compact ${snapshot.settings.adaptiveTriggersEnabled ? 'active' : ''} ${controllerPowerSavingActive && snapshot.settings.adaptiveTriggersEnabled ? 'power-saving-active' : ''}`}
                      aria-pressed={snapshot.settings.adaptiveTriggersEnabled}
                      aria-label="Enable adaptive triggers"
                      title="Enable adaptive triggers"
                      disabled={!controllerControlsAvailable || !adaptiveTriggersSupported || pendingAction !== null}
                      onClick={toggleAdaptiveTriggersEnabled}
                    >
                      <IconDeviceGamepad2 size={20} />
                    </button>
                    <div className="title-copy">
                      <h3>Intensity</h3>
                      <p>Set the overall strength of adaptive trigger effects</p>
                    </div>
                  </div>
                  <div className="framed-slider">
                    <label className="slider-row">
                      <span>0%</span>
                      <div className="range-control">
                        <input
                          type="range"
                          min="0"
                          max={percentSliderMax}
                          step={TRIGGER_EFFECT_STEP}
                          value={triggerEffectIntensityValue}
                          disabled={!connected || !adaptiveTriggersSupported || !snapshot.settings.adaptiveTriggersEnabled}
                          style={{ '--range-fill': `${(triggerEffectIntensityValue / percentSliderMax) * 100}%` } as CSSProperties}
                          onPointerDown={() => {
                            triggerEffectEditingRef.current = true;
                          }}
                          onChange={(event) => (
                            setTriggerEffectIntensityValue(snapTriggerEffectIntensity(Number(event.currentTarget.value)))
                          )}
                          onPointerUp={() => void commitTriggerEffectIntensity()}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              triggerEffectEditingRef.current = true;
                            }
                          }}
                          onKeyUp={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              void commitTriggerEffectIntensity();
                            }
                          }}
                          onBlur={() => void commitTriggerEffectIntensity()}
                        />
                        <div className="range-ticks" aria-hidden="true">
                          {PERCENT_SLIDER_TICKS.map((value) => (
                            <span key={value} className={sliderTickClass(value, 100)} />
                          ))}
                        </div>
                      </div>
                      <strong>{triggerEffectIntensityValue}%</strong>
                    </label>
                  </div>
                  <div className="segmented-row">
                    {TRIGGER_EFFECT_PRESETS.map(([label, value]) => (
                      <button
                        key={label}
                        type="button"
                        className={triggerEffectIntensityValue === value ? 'active' : ''}
                        disabled={!connected || !adaptiveTriggersSupported || !snapshot.settings.adaptiveTriggersEnabled || pendingAction !== null}
                        onClick={() => setTriggerIntensityPreset(Number(value))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
              </div>
              <FeatureTipsPanel
                tab="triggers"
                onSettingsFocusRequest={focusBridgeSettings}
              />
          </div>

          <div
            className={`control-page trigger-profiles-page ${activeControlTab === 'trigger-profiles' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-trigger-profiles"
            aria-labelledby="control-tab-trigger-profiles"
            aria-hidden={activeControlTab !== 'trigger-profiles'}
          >
            <div className="feature-heading">
              <div>
                <h2>Game Trigger Profiles</h2>
                <p>Automatically switch adaptive trigger effects per game.</p>
              </div>
              <div
                className="trigger-profiles-heading-status"
                title={
                  triggerProfileEngineStatus
                    ? formatEngineStatusLine(
                        triggerProfileEngineStatus,
                        triggerProfileNameById(triggerProfileEngineStatus.activeProfileId)
                      )
                    : 'Waiting for engine status'
                }
              >
                <div className="trigger-profiles-status-group">
                  <span className="overview-status-heading">
                    <Activity size={14} />
                    Engine
                  </span>
                  <span className="status-badge">
                    <span
                      className={`dot ${
                        triggerProfileEngineStatus && triggerProfileEngineStatus.enabled && !triggerProfileEngineStatus.suspended
                          ? 'good'
                          : 'warn'
                      }`}
                    />
                    <strong>
                      {!triggerProfileEngineStatus
                        ? 'Waiting for status'
                        : triggerProfileEngineStatus.suspended
                          ? 'Suspended'
                          : triggerProfileEngineStatus.enabled
                            ? 'Running'
                            : 'Disabled'}
                    </strong>
                  </span>
                </div>
              </div>
              <div className="inline-switch">
                <span>Game Trigger Profiles</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={triggerProfilesEnabled}
                  aria-label="Enable game trigger profiles"
                  className={`switch ${triggerProfilesEnabled ? 'on' : ''}`}
                  onClick={() => void toggleTriggerProfilesEnabled()}
                >
                  <span />
                </button>
              </div>
            </div>

            <div className="feature-card-grid trigger-profiles-grid">
              {triggerProfileDraft ? (
                <section className="feature-card trigger-profiles-editor-card">
                  <div className="feature-card-title">
                    <span className="feature-icon"><Pencil size={20} /></span>
                    <div className="title-copy">
                      <h3>Editor</h3>
                      <p>Edit the selected profile's match rules and trigger effects.</p>
                      {triggerProfileDraft.meta?.source ? (
                        <p className="trigger-profiles-provenance">
                          {triggerProfileDraft.meta.source === 'library' ? 'From library' : 'Imported'}
                        </p>
                      ) : null}
                    </div>
                    {/* .feature-card-title is a three-column grid, so the header's actions live in
                        one cell -- loose buttons overflow the template onto an implicit row. */}
                    <div className="trigger-profiles-editor-header-actions">
                      <div className="trigger-profiles-status-group trigger-profiles-editor-match-source">
                        <span className="overview-status-heading">
                          <IconDeviceGamepad2 size={14} />
                          Match Source
                        </span>
                        <span className="status-badge">
                          <strong>
                            {!triggerProfileEngineStatus
                              ? '—'
                              : triggerProfileEngineStatus.matchedBy === 'pin'
                                ? 'Pinned'
                                : triggerProfileEngineStatus.matchedBy === 'process'
                                  ? `Process: ${triggerProfileEngineStatus.matchedName ?? 'unknown'}`
                                  : 'Default fallback'}
                          </strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="secondary-action trigger-profiles-transfer-button"
                        onClick={() => void importTriggerProfilesFromDisk()}
                      >
                        <IconDownload size={14} />
                        Import
                      </button>
                      <button
                        type="button"
                        className="secondary-action trigger-profiles-transfer-button"
                        disabled={!triggerProfileDraft}
                        onClick={() => void exportTriggerProfileDraft()}
                      >
                        <IconUpload size={14} />
                        Export
                      </button>
                      <button
                        type="button"
                        className="primary-action trigger-profiles-save-button"
                        onClick={() => void saveTriggerProfileDraft()}
                      >
                        <Save size={14} />
                        Save
                      </button>
                    </div>
                  </div>

                  <div className="trigger-profiles-editor-body">
                  <div className="trigger-profiles-states-strip">
                    <span className="trigger-profiles-states-label">States</span>
                    {(triggerProfileDraft.states ?? []).map((state, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`trigger-lab-chip compact ${index === triggerProfileEditingState ? 'active' : ''}`}
                        aria-pressed={index === triggerProfileEditingState}
                        onClick={() => setTriggerProfileEditingState(index)}
                      >
                        <span className="trigger-lab-chip-label">{state.name || `State ${index + 1}`}</span>
                      </button>
                    ))}
                    {(triggerProfileDraft.states?.length ?? 0) < MAX_STATES_PER_PROFILE && (
                      <button
                        type="button"
                        className="trigger-lab-chip compact trigger-profiles-state-add"
                        onClick={() => addTriggerProfileState()}
                      >
                        <Plus size={13} />
                        <span className="trigger-lab-chip-label">
                          {triggerProfileDraft.states?.length ? 'Add state' : 'Add states'}
                        </span>
                      </button>
                    )}
                    {!triggerProfileDraft.states?.length && (
                      <span className="trigger-profiles-states-hint">
                        One feel for the whole game — add states for per-weapon or per-vehicle feels.
                      </span>
                    )}
                  </div>
                  {triggerProfileDraft.states && triggerProfileDraft.states[triggerProfileEditingState] && (
                    <div className="trigger-profiles-state-row">
                      <label className="trigger-profiles-state-name-field">
                        <span>State name</span>
                        <input
                          value={triggerProfileDraft.states[triggerProfileEditingState].name}
                          maxLength={MAX_STATE_NAME_LENGTH}
                          onChange={(event) => renameTriggerProfileState(triggerProfileEditingState, event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="secondary-action"
                        disabled={(triggerProfileDraft.states?.length ?? 0) >= MAX_STATES_PER_PROFILE}
                        onClick={() => duplicateTriggerProfileState(triggerProfileEditingState)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="secondary-action trigger-profiles-state-remove"
                        onClick={() => removeTriggerProfileState(triggerProfileEditingState)}
                      >
                        <X size={14} />
                        Remove state
                      </button>
                    </div>
                  )}
                  <div className="trigger-profiles-slots">
                  {TRIGGER_PROFILE_SLOTS.map(([slot, label]) => {
                    const slotConfig = editingStateTriggers(triggerProfileDraft, triggerProfileEditingState)[slot];
                    const sideLabel = slot === 'l2' ? 'Left Trigger' : 'Right Trigger';
                    const glyphUrl = slot === 'l2' ? l2GlyphUrl : r2GlyphUrl;
                    const baseActive = slotConfig.base !== null;
                    const modifiersOpen = triggerProfileModifiersOpen[slot];
                    const setBaseActive = (active: boolean) => updateTriggerProfileSlot(slot, (config) => ({
                      ...config,
                      base: active ? (config.base ?? defaultTriggerEffectSpec()) : null
                    }), { mirrorBase: triggerProfilesLinked });
                    return (
                      <section key={slot} className="feature-card trigger-lab-card trigger-lab-trigger-card trigger-profiles-slot-card">
                        <div className="feature-card-title">
                          <button
                            type="button"
                            className={`feature-icon triggers-enable-button trigger-lab-trigger-badge ${baseActive ? 'active' : ''}`}
                            aria-pressed={baseActive}
                            aria-label={`${sideLabel} base effect`}
                            onClick={() => setBaseActive(!baseActive)}
                          >
                            <span
                              className="trigger-lab-trigger-glyph"
                              style={{
                                WebkitMaskImage: `url("${glyphUrl}")`,
                                maskImage: `url("${glyphUrl}")`
                              } as CSSProperties}
                            />
                          </button>
                          <div className="title-copy">
                            <h3>{sideLabel}</h3>
                            <p>Shape the {label} trigger feel</p>
                          </div>
                          <div className="inline-switch trigger-lab-card-active">
                            <span>Active</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={baseActive}
                              aria-label={`${sideLabel} base effect`}
                              className={`switch trigger-lab-active-switch ${baseActive ? 'on' : ''}`}
                              onClick={() => setBaseActive(!baseActive)}
                            >
                              <span />
                            </button>
                          </div>
                        </div>
                        <div className="trigger-lab-editor">
                          <div className="trigger-lab-profile-row trigger-profiles-linked-row">
                            <span className="trigger-profiles-base-label">Base Effect</span>
                            <button
                              type="button"
                              className={`trigger-lab-chip compact ${triggerProfilesLinked ? 'active' : ''}`}
                              aria-pressed={triggerProfilesLinked}
                              onClick={() => toggleTriggerProfilesLinked(slot)}
                            >
                              {triggerProfilesLinked ? <LinkIcon size={13} /> : <LinkOffIcon size={13} />}
                              <span className="trigger-lab-chip-label">{triggerProfilesLinked ? 'Linked' : 'Split'}</span>
                            </button>
                          </div>
                          {slotConfig.base ? (
                            <TriggerEffectEditor
                              label={sideLabel}
                              value={slotConfig.base}
                              onChange={(effect) => updateTriggerProfileSlot(slot, (config) => ({
                                ...config,
                                base: config.base ? effect : config.base
                              }), { mirrorBase: triggerProfilesLinked })}
                            />
                          ) : (
                            <p className="trigger-profiles-slot-off-note">
                              No base effect — game trigger output passes through.
                            </p>
                          )}
                          <div className="trigger-profiles-modifiers-section">
                            <button
                              type="button"
                              className="trigger-profiles-modifiers-toggle"
                              aria-expanded={modifiersOpen}
                              onClick={() => setTriggerProfileModifiersOpen((open) => ({ ...open, [slot]: !open[slot] }))}
                            >
                              <ChevronDown size={14} className={`trigger-profiles-modifiers-chevron ${modifiersOpen ? 'open' : ''}`} />
                              Modifiers ({slotConfig.modifiers.length})
                            </button>
                            {modifiersOpen && (
                              <>
                        <div className="trigger-profiles-modifiers">
                          {slotConfig.modifiers.map((modifier, modifierIndex) => (
                            <div key={modifierIndex} className="trigger-profiles-modifier">
                              <div className="trigger-profiles-modifier-condition">
                                <CustomSelect
                                  value={modifier.when.condition as InputConditionType}
                                  options={TRIGGER_PROFILE_CONDITION_OPTIONS}
                                  ariaLabel={`${label} modifier ${modifierIndex + 1} condition`}
                                  onChange={(condition) => updateTriggerProfileSlot(slot, (config) => ({
                                    ...config,
                                    modifiers: config.modifiers.map((entry, index) => (
                                      index === modifierIndex
                                        ? { ...entry, when: { ...entry.when, condition } }
                                        : entry
                                    ))
                                  }))}
                                />
                                {(modifier.when.condition === 'trigger-held-over') && (
                                  <>
                                    <label className="trigger-profiles-modifier-param">
                                      <span>Threshold %</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={255}
                                        value={modifier.when.threshold ?? 0}
                                        onChange={(event) => {
                                          const raw = Number(event.target.value);
                                          if (Number.isNaN(raw)) return;
                                          const threshold = clampByte(raw);
                                          updateTriggerProfileSlot(slot, (config) => ({
                                            ...config,
                                            modifiers: config.modifiers.map((entry, index) => (
                                              index === modifierIndex
                                                ? { ...entry, when: { ...entry.when, threshold } }
                                                : entry
                                            ))
                                          }));
                                        }}
                                      />
                                    </label>
                                    <label className="trigger-profiles-modifier-param">
                                      <span>Hold ms</span>
                                      <input
                                        type="number"
                                        min={0}
                                        value={modifier.when.ms ?? 0}
                                        onChange={(event) => {
                                          const raw = Number(event.target.value);
                                          if (Number.isNaN(raw)) return;
                                          const ms = Math.max(0, Math.round(raw));
                                          updateTriggerProfileSlot(slot, (config) => ({
                                            ...config,
                                            modifiers: config.modifiers.map((entry, index) => (
                                              index === modifierIndex
                                                ? { ...entry, when: { ...entry.when, ms } }
                                                : entry
                                            ))
                                          }));
                                        }}
                                      />
                                    </label>
                                  </>
                                )}
                                {modifier.when.condition === 'button-held' && (
                                  <label className="trigger-profiles-modifier-param">
                                    <span>Button</span>
                                    <input
                                      value={modifier.when.button ?? ''}
                                      onChange={(event) => {
                                        const button = event.target.value;
                                        updateTriggerProfileSlot(slot, (config) => ({
                                          ...config,
                                          modifiers: config.modifiers.map((entry, index) => (
                                            index === modifierIndex
                                              ? { ...entry, when: { ...entry.when, button } }
                                              : entry
                                          ))
                                        }));
                                      }}
                                    />
                                  </label>
                                )}
                                {modifier.when.condition === 'rapid-fire' && (
                                  <label className="trigger-profiles-modifier-param">
                                    <span>Presses/sec</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={modifier.when.pressesPerSecond ?? 0}
                                      onChange={(event) => {
                                        const raw = Number(event.target.value);
                                        if (Number.isNaN(raw)) return;
                                        const pressesPerSecond = Math.max(1, Math.round(raw));
                                        updateTriggerProfileSlot(slot, (config) => ({
                                          ...config,
                                          modifiers: config.modifiers.map((entry, index) => (
                                            index === modifierIndex
                                              ? { ...entry, when: { ...entry.when, pressesPerSecond } }
                                              : entry
                                          ))
                                        }));
                                      }}
                                    />
                                  </label>
                                )}
                                <button
                                  type="button"
                                  className="icon-compact trigger-profiles-modifier-remove"
                                  aria-label={`Remove ${label} modifier ${modifierIndex + 1}`}
                                  onClick={() => updateTriggerProfileSlot(slot, (config) => ({
                                    ...config,
                                    modifiers: config.modifiers.filter((_, index) => index !== modifierIndex)
                                  }))}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <div className="trigger-profiles-effect-sliders">
                                <TriggerEffectEditor
                                  compact
                                  label={`${label} modifier ${modifierIndex + 1}`}
                                  value={modifier.effect}
                                  onChange={(effect) => updateTriggerProfileSlot(slot, (config) => ({
                                    ...config,
                                    modifiers: config.modifiers.map((entry, index) => (
                                      index === modifierIndex ? { ...entry, effect } : entry
                                    ))
                                  }))}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                                <button
                                  type="button"
                                  className="secondary-action trigger-profiles-modifier-add"
                                  onClick={() => updateTriggerProfileSlot(slot, (config) => ({
                                    ...config,
                                    modifiers: [...config.modifiers, defaultTriggerModifier()]
                                  }))}
                                >
                                  <Plus size={14} />
                                  Add Modifier
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                  </div>

                  <div className="trigger-profiles-group">
                    <h4 className="trigger-profiles-group-title">Identity &amp; Matching</h4>
                    <label className="trigger-profiles-name-field">
                      <span>Name</span>
                      <input
                        value={triggerProfileDraft.name}
                        maxLength={48}
                        onChange={(event) => {
                          const name = event.target.value;
                          setTriggerProfileDraft((draft) => (draft ? { ...draft, name } : draft));
                        }}
                      />
                    </label>

                    <label className="trigger-profiles-process-field">
                      <span>Process Names (comma-separated)</span>
                      <input
                        value={triggerProfileProcessNamesInput}
                        placeholder="game.exe, other.exe"
                        onChange={(event) => setTriggerProfileProcessNamesInput(event.target.value)}
                      />
                    </label>

                    <div className="game-detect-anchor" ref={gameDetectPopoverRef}>
                      <button
                        type="button"
                        className="secondary-action game-detect-button"
                        disabled={gameDetectLoading}
                        onClick={() => void detectRunningGame()}
                      >
                        <SearchIcon size={14} />
                        Detect running game
                      </button>

                      {gameDetectPopoverOpen && (
                        <div className="game-detect-popover" role="dialog" aria-label="Detected running games">
                          {gameDetectCandidates.length === 0 ? (
                            <p className="game-detect-empty">No game detected — is it running?</p>
                          ) : (
                            <ul className="game-detect-list">
                              {gameDetectCandidates.map((candidate) => (
                                <li key={candidate.name}>
                                  <button
                                    type="button"
                                    className="game-detect-candidate"
                                    onClick={() => pickDetectedGameProcess(candidate.name)}
                                  >
                                    <span className="game-detect-candidate-name">{candidate.name}</span>
                                    {candidate.kind !== 'other' && (
                                      <span className="game-detect-candidate-kind">
                                        {candidate.kind === 'proton' ? 'Proton' : 'game path'}
                                      </span>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {triggerProfileDraft.states && triggerProfileDraft.states.length > 1 && (
                    <div className="trigger-profiles-group">
                      <h4 className="trigger-profiles-group-title">State Switching</h4>
                      <p className="trigger-profiles-switching-hint">
                        Bind the game's own controls: rules fire on button presses and change the
                        active state. Switching is inferred from your inputs — use the state chips
                        or a select rule to re-sync if it drifts.
                      </p>
                      <div className="trigger-profiles-switch-rules">
                        {(triggerProfileDraft.switching?.rules ?? []).map((rule, ruleIndex) => (
                          <div key={ruleIndex} className="trigger-profiles-switch-rule">
                            <CustomSelect
                              value={rule.button}
                              options={STATE_SWITCH_BUTTON_OPTIONS}
                              ariaLabel={`Switch rule ${ruleIndex + 1} button`}
                              onChange={(button) => updateTriggerProfileSwitchRule(ruleIndex, { button })}
                            />
                            <CustomSelect
                              value={rule.action}
                              options={STATE_SWITCH_ACTION_OPTIONS}
                              ariaLabel={`Switch rule ${ruleIndex + 1} action`}
                              onChange={(action) => updateTriggerProfileSwitchRule(ruleIndex, {
                                action,
                                ...(action === 'select'
                                  ? { state: rule.state ?? triggerProfileDraft.states?.[0]?.name }
                                  : {})
                              })}
                            />
                            {rule.action === 'select' && (
                              <CustomSelect
                                value={rule.state ?? ''}
                                options={(triggerProfileDraft.states ?? []).map(
                                  (state): [string, string] => [state.name, state.name]
                                )}
                                ariaLabel={`Switch rule ${ruleIndex + 1} target state`}
                                onChange={(state) => updateTriggerProfileSwitchRule(ruleIndex, { state })}
                              />
                            )}
                            <CustomSelect
                              value={rule.while ?? ''}
                              options={STATE_SWITCH_WHILE_OPTIONS}
                              ariaLabel={`Switch rule ${ruleIndex + 1} chord button`}
                              onChange={(chord) => updateTriggerProfileSwitchRule(ruleIndex, { while: chord })}
                            />
                            <button
                              type="button"
                              className="icon-compact trigger-profiles-modifier-remove"
                              aria-label={`Remove switch rule ${ruleIndex + 1}`}
                              onClick={() => updateTriggerProfileSwitching((switching) => ({
                                ...switching,
                                rules: switching.rules.filter((_, at) => at !== ruleIndex)
                              }))}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="secondary-action trigger-profiles-modifier-add"
                        disabled={(triggerProfileDraft.switching?.rules.length ?? 0) >= 16}
                        onClick={() => updateTriggerProfileSwitching((switching) => ({
                          ...switching,
                          rules: [...switching.rules, { button: 'triangle', action: 'cycle' }]
                        }))}
                      >
                        <Plus size={14} />
                        Add Switch Rule
                      </button>
                      <div className="trigger-profiles-switch-settings">
                        <label className="trigger-profiles-modifier-param">
                          <span>Default state</span>
                          <CustomSelect
                            value={triggerProfileDraft.switching?.defaultState ?? triggerProfileDraft.states[0].name}
                            options={triggerProfileDraft.states.map(
                              (state): [string, string] => [state.name, state.name]
                            )}
                            ariaLabel="Default state"
                            onChange={(name) => updateTriggerProfileSwitching((switching) => ({
                              ...switching,
                              defaultState: name
                            }))}
                          />
                        </label>
                        <label className="trigger-profiles-modifier-param">
                          <span>Menu button</span>
                          <CustomSelect
                            value={triggerProfileDraft.switching?.menuButtons?.[0] ?? ''}
                            options={STATE_SWITCH_MENU_OPTIONS}
                            ariaLabel="Menu guard button"
                            onChange={(button) => updateTriggerProfileSwitching((switching) => {
                              const next = { ...switching };
                              if (button === '') delete next.menuButtons;
                              else next.menuButtons = [button];
                              return next;
                            })}
                          />
                        </label>
                        <label className="trigger-profiles-modifier-param">
                          <span>Menu timeout (s)</span>
                          <input
                            type="number"
                            min={0}
                            value={Math.round((triggerProfileDraft.switching?.menuTimeoutMs ?? 0) / 1000)}
                            onChange={(event) => {
                              const raw = Number(event.target.value);
                              if (Number.isNaN(raw)) return;
                              const menuTimeoutMs = Math.max(0, Math.round(raw)) * 1000;
                              updateTriggerProfileSwitching((switching) => {
                                const next = { ...switching };
                                if (menuTimeoutMs === 0) delete next.menuTimeoutMs;
                                else next.menuTimeoutMs = menuTimeoutMs;
                                return next;
                              });
                            }}
                          />
                        </label>
                      </div>

                      <div className="inline-switch stick-wheel-toggle">
                        <span>Analog wheel</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={triggerProfileDraft.switching?.stickWheel !== undefined}
                          aria-label="Enable analog wheel state selection"
                          className={`switch ${triggerProfileDraft.switching?.stickWheel ? 'on' : ''}`}
                          onClick={() => updateTriggerProfileSwitching((switching) => {
                            const next = { ...switching };
                            if (next.stickWheel) {
                              delete next.stickWheel;
                            } else {
                              next.stickWheel = {
                                button: 'triangle',
                                thresholdPercent: 50,
                                angleOffsetDeg: 0,
                                sectors: (triggerProfileDraft.states ?? [])
                                  .slice(0, 12)
                                  .map((state) => state.name)
                              };
                            }
                            return next;
                          })}
                        >
                          <span />
                        </button>
                      </div>
                      {triggerProfileDraft.switching?.stickWheel && (
                        <>
                          <p className="trigger-profiles-switching-hint">
                            Mirrors the game's weapon wheel: hold the wheel button, point the left
                            stick at a slot, release to commit. Tune the threshold and rotation
                            until the live dot lands on the same slot as the game's own wheel.
                          </p>
                          <StickWheelEditor
                            wheel={triggerProfileDraft.switching.stickWheel}
                            stateNames={(triggerProfileDraft.states ?? []).map((state) => state.name)}
                            buttonOptions={STATE_SWITCH_BUTTON_OPTIONS}
                            liveSample={stickSample}
                            onChange={(stickWheel) => updateTriggerProfileSwitching((switching) => ({
                              ...switching,
                              stickWheel
                            }))}
                            renderSelect={({ value, options, ariaLabel, onChange }) => (
                              <CustomSelect
                                value={value}
                                options={options}
                                ariaLabel={ariaLabel}
                                onChange={onChange}
                              />
                            )}
                          />
                        </>
                      )}
                    </div>
                  )}

                  </div>
                </section>
              ) : (
                <section className="feature-card trigger-profiles-editor-card trigger-profiles-editor-empty">
                  <div className="feature-card-title">
                    <span className="feature-icon"><Pencil size={20} /></span>
                    <div className="title-copy">
                      <h3>Editor</h3>
                      <p>Edit the selected profile's match rules and trigger effects.</p>
                    </div>
                    <div className="trigger-profiles-status-group trigger-profiles-editor-match-source">
                      <span className="overview-status-heading">
                        <IconDeviceGamepad2 size={14} />
                        Match Source
                      </span>
                      <span className="status-badge">
                        <strong>
                          {!triggerProfileEngineStatus
                            ? '—'
                            : triggerProfileEngineStatus.matchedBy === 'pin'
                              ? 'Pinned'
                              : triggerProfileEngineStatus.matchedBy === 'process'
                                ? `Process: ${triggerProfileEngineStatus.matchedName ?? 'unknown'}`
                                : 'Default fallback'}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <div className="trigger-profiles-empty-state">
                    <IconTargetArrow size={22} />
                    <p>Select a profile in the strip below, or create a new one to start editing.</p>
                  </div>
                </section>
              )}
            </div>

            <div className="trigger-profiles-strip" ref={triggerStripRef}>
              {(() => {
                const { chips, overflow } = pickTriggerStripChips(
                  triggerStripProfiles,
                  selectedTriggerProfileId,
                  triggerStripWidth > 0 && triggerStripActionsWidth > 0
                    ? triggerStripMaxChips(triggerStripWidth - triggerStripActionsWidth)
                    : 2
                );
                const overflowActive = overflow.find(
                  (profile) => triggerProfileEngineStatus?.activeProfileId === profile.id
                ) ?? null;
                const overflowSelected = overflow.find(
                  (profile) => profile.id === selectedTriggerProfileId
                ) ?? null;
                const dropdownValue = overflowSelected ? overflowSelected.id : '';
                const dropdownOptions: Array<[string, string]> = [
                  ['More profiles', ''],
                  ...overflow.map((profile): [string, string] => [profile.name, profile.id])
                ];
                return (
                  <>
                    <ul className="trigger-profiles-strip-list">
                      {chips.map((profile) => (
                        <li key={profile.id}>
                          <button
                            type="button"
                            className={`trigger-profiles-chip ${selectedTriggerProfileId === profile.id ? 'active' : ''}`}
                            title={
                              profile.id === 'default'
                                ? 'Fallback when no game matches'
                                : profile.match.processNames.length > 0
                                  ? profile.match.processNames.join(', ')
                                  : 'No process match set'
                            }
                            onClick={() => selectTriggerProfile(profile.id)}
                          >
                            {triggerProfileEngineStatus?.activeProfileId === profile.id && (
                              <span className="dot good" aria-label="Currently active" />
                            )}
                            <span className="trigger-profiles-chip-name">{profile.name}</span>
                            {triggerProfileEngineStatus?.activeProfileId === profile.id
                              && triggerProfileEngineStatus.matchedBy === 'pin' && (
                              <span className="trigger-profiles-chip-matched">pinned</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {overflow.length > 0 && (
                      <div className="trigger-profiles-strip-more">
                        <CustomSelect
                          className="trigger-profiles-more-select"
                          value={dropdownValue}
                          options={dropdownOptions}
                          ariaLabel="Switch to another trigger profile"
                          floatingMenu
                          floatingMenuMinWidth={240}
                          showSelectedCheck={false}
                          searchable
                          searchPlaceholder="Filter profiles"
                          renderValue={() => (
                            <span className="trigger-profiles-more-trigger">
                              {overflowActive && (
                                <span className="dot good" aria-label="An overflow profile is active" />
                              )}
                              <span>More profiles</span>
                              <span className="trigger-profiles-more-count">{overflow.length}</span>
                            </span>
                          )}
                          renderOption={(label, optionValue) => (
                            <span className="trigger-profiles-more-option">
                              {triggerProfileEngineStatus?.activeProfileId === optionValue && optionValue !== '' && (
                                <span className="dot good" aria-label="Currently active" />
                              )}
                              <span className="trigger-profiles-more-option-name">{label}</span>
                              {optionValue === selectedTriggerProfileId && optionValue !== '' && (
                                <span className="trigger-profiles-chip-matched">editing</span>
                              )}
                            </span>
                          )}
                          onChange={(value) => {
                            if (value) selectTriggerProfile(value);
                          }}
                        />
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="trigger-profiles-strip-actions" ref={triggerStripActionsRef}>
                {triggerProfileTransferStatus ? (
                  <span className="trigger-profiles-transfer-status">
                    <span className={`status-badge ${triggerProfileTransferStatus.tone}`}>
                      {triggerProfileTransferStatus.message}
                    </span>
                    {triggerProfileTransferStatus.failures && triggerProfileTransferStatus.failures.length > 0 ? (
                      <span className="trigger-profiles-transfer-errors">
                        {triggerProfileTransferStatus.failures.map((failure, index) => (
                          <span key={`${failure.file}-${index}`} className="trigger-profiles-transfer-error">
                            <strong>{failure.file}</strong> — {failure.error}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="trigger-profiles-library-button"
                  onClick={() => void openTriggerProfileLibrary()}
                >
                  <IconBooks size={14} />
                  Library
                </button>
                <button type="button" onClick={createTriggerProfile}>
                  <Plus size={14} />
                  New
                </button>
                <button type="button" disabled={!triggerProfileDraft} onClick={duplicateTriggerProfile}>
                  Duplicate
                </button>
                {triggerProfileDraft?.meta?.libraryFile ? (
                  <button
                    type="button"
                    title="Re-download this profile from the library, discarding your changes"
                    onClick={() => triggerProfileDraft && setTriggerProfileResetConfirm({
                      id: triggerProfileDraft.id,
                      name: triggerProfileDraft.name
                    })}
                  >
                    <RefreshCcw size={14} />
                    Reset
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!triggerProfileDraft || triggerProfileDraft.id === 'default'}
                  onClick={() => triggerProfileDraft && openTriggerProfileDeleteConfirm(triggerProfileDraft)}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
                <button
                  type="button"
                  className={`trigger-profiles-auto-toggle ${triggerProfileEngineStatus?.matchedBy === 'pin' ? '' : 'on'}`}
                  aria-pressed={triggerProfileEngineStatus?.matchedBy !== 'pin'}
                  title={
                    triggerProfileEngineStatus?.matchedBy === 'pin'
                      ? `Using ${triggerProfileNameById(triggerProfileEngineStatus.activeProfileId)} — click to resume automatic game matching`
                      : 'Auto matching running games — click to pin the Default profile'
                  }
                  onClick={() => {
                    if (triggerProfileEngineStatus?.matchedBy === 'pin') {
                      // Back to auto: unpinned, the engine falls back to Default until a game matches.
                      void pinSelectedTriggerProfile('');
                    } else {
                      selectTriggerProfile('default');
                    }
                  }}
                >
                  Auto
                </button>
              </div>
            </div>
          </div>

          <div
            className={`control-page lighting-page ${activeControlTab === 'lighting' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-lighting"
            aria-labelledby="control-tab-lighting"
            aria-hidden={activeControlTab !== 'lighting'}
          >
              <div className="feature-heading">
                <div>
                  <h2>Lighting</h2>
                  <p>Customize the controller light bar and override behavior</p>
                </div>
                <div className="inline-switch">
                  <span>Enabled</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.lightbarEnabled}
                    className={`switch ${snapshot.settings.lightbarEnabled ? 'on' : ''}`}
                    disabled={!controllerControlsAvailable || !lightbarSupported || pendingAction !== null}
                    onClick={toggleLightbarEnabled}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div className="feature-card-grid lighting-grid">
                <section className="feature-card preset-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon lighting-enable-button icon-large ${snapshot.settings.lightbarEnabled ? 'active' : ''} ${controllerPowerSavingActive && snapshot.settings.lightbarEnabled ? 'power-saving-active' : ''}`}
                      aria-pressed={snapshot.settings.lightbarEnabled}
                      aria-label="Enable lighting"
                      title="Enable lighting"
                      disabled={!controllerControlsAvailable || !lightbarSupported || pendingAction !== null}
                      onClick={toggleLightbarEnabled}
                    >
                      <IconBulb size={20} />
                    </button>
                    <div className="title-copy">
                      <h3>Brightness</h3>
                      <p>Set the controller light bar brightness</p>
                    </div>
                  </div>
                  <div className="framed-slider">
                    <label className="slider-row">
                      <span>0%</span>
                      <div className="range-control">
                        <input
                          type="range"
                          min="0"
                          max={percentSliderMax}
                          step={LIGHTBAR_BRIGHTNESS_STEP}
                          value={lightbarBrightnessValue}
                          disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled}
                          style={{ '--range-fill': `${(lightbarBrightnessValue / percentSliderMax) * 100}%` } as CSSProperties}
                          onPointerDown={() => {
                            lightbarBrightnessEditingRef.current = true;
                          }}
                          onChange={(event) => setLightbarBrightnessValue(snapLightbarBrightness(Number(event.currentTarget.value)))}
                          onPointerUp={() => void commitLightbar()}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              lightbarBrightnessEditingRef.current = true;
                            }
                          }}
                          onKeyUp={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              void commitLightbar();
                            }
                          }}
                          onBlur={() => void commitLightbar()}
                        />
                        <div className="range-ticks" aria-hidden="true">
                          {PERCENT_SLIDER_TICKS.map((value) => (
                            <span key={value} className={sliderTickClass(value, 100)} />
                          ))}
                        </div>
                      </div>
                      <strong>{lightbarBrightnessValue}%</strong>
                    </label>
                  </div>
                  <div className="segmented-row">
                    {LIGHTBAR_PRESETS.map(([label, value]) => (
                      <button
                        key={label}
                        type="button"
                        className={lightbarBrightnessValue === value ? 'active' : ''}
                        disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled}
                        onClick={() => setLightbarPreset(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="feature-card behavior-card">
                  <div className="feature-card-title">
                    <span className="feature-icon"><Palette size={20} /></span>
                    <div className="title-copy">
                      <h3>Behavior</h3>
                      <p>Set light bar behavior</p>
                    </div>
                  </div>
                  <div className="behavior-toggle-row">
                    <div>
                      <strong>Light Bar Override</strong>
                      <p>Use app-controlled lighting instead of the default controller behavior</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={snapshot.settings.lightbarOverrideEnabled}
                      className={`switch ${snapshot.settings.lightbarOverrideEnabled ? 'on' : ''}`}
                      disabled={!connected || !lightbarOverrideSupported || !snapshot.settings.lightbarEnabled}
                      onClick={() => void runAction('lightbar-override', () => (
                        window.bridge.setLightbarOverrideEnabled(!snapshot.settings.lightbarOverrideEnabled)
                      ))}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="light-color-panel">
                    <strong>Light Color</strong>
                    <div className="behavior-swatches" aria-label="Light bar color">
                      {LIGHTBAR_SWATCHES.map((color) => (
                        <button
                          key={color}
                          type="button"
                          title={`${lightbarColorName(color)} ${color.toUpperCase()}`}
                          className={normalizedLightbarColor === color ? 'active' : ''}
                          style={{ '--swatch-color': color } as CSSProperties}
                          disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled}
                          onClick={() => selectLightbarColor(color)}
                        />
                      ))}
                      <div className="custom-color-anchor" ref={customColorPickerRef}>
                        <button
                          type="button"
                          className={`custom-color-swatch ${customSwatchSelected ? 'active' : ''} ${showCustomColorPicker ? 'picker-open' : ''} ${customSwatchPrimed && !customLightbarColor ? 'primed' : ''}`}
                          title={customLightbarColor ? `Custom ${customLightbarColor.toUpperCase()}` : 'Double-click to create a custom color'}
                          style={{ '--picker-color': customSwatchColor } as CSSProperties}
                          disabled={customColorPickerDisabled}
                          aria-pressed={customSwatchSelected}
                          onClick={selectCustomLightbarColor}
                          onDoubleClick={openCustomLightbarPicker}
                        >
                          <span className="custom-color-fill" aria-hidden="true" />
                          <Palette size={15} aria-hidden="true" />
                        </button>
                        {showCustomColorPicker && (
                          <div className="custom-color-popover" role="dialog" aria-label="Custom light bar color picker">
                            <div className="custom-color-popover-head">
                              <strong>Custom Color</strong>
                              <span>{customColorDraft.toUpperCase()}</span>
                            </div>
                            <div className="custom-color-palette" role="grid" aria-label="Custom color palette">
                              {LIGHTBAR_CUSTOM_PALETTE.map((row) => (
                                <div className="custom-color-palette-row" role="row" key={row[0].color}>
                                  {row.map((cell) => (
                                    <button
                                      key={cell.color}
                                      type="button"
                                      role="gridcell"
                                      className={normalizeHexColor(customColorDraft) === cell.color ? 'selected' : ''}
                                      style={{ '--picker-color': cell.color } as CSSProperties}
                                      title={`${cell.name} ${cell.color.toUpperCase()}`}
                                      aria-label={`${cell.name} ${cell.color.toUpperCase()}`}
                                      disabled={customColorPickerDisabled}
                                      onClick={() => previewCustomLightbarColor(cell.color)}
                                    />
                                  ))}
                                </div>
                              ))}
                            </div>
                            <div className="custom-color-picker-row">
                              <span
                                className="custom-color-preview"
                                style={{ '--picker-color': customColorDraft } as CSSProperties}
                                aria-hidden="true"
                              />
                              <code>{customColorDraft.toUpperCase()}</code>
                            </div>
                            <button
                              type="button"
                              className="custom-color-apply"
                              disabled={customColorPickerDisabled}
                              onClick={() => saveCustomLightbarColor(customColorDraft)}
                            >
                              Use Color
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="light-color-meta">
                      <strong>{lightbarColorName(lightbarColor)}</strong>
                      <span>{normalizedLightbarColor.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="feature-status lighting-status">
                    <span className={`status-badge ${lightbarStateActive ? 'good' : 'idle'}`}>
                      <span className={`dot ${lightbarStateActive ? 'good' : 'idle'}`} />
                      <strong>{lightbarStateLabel}</strong>
                    </span>
                  </div>
                </section>
              </div>
              <FeatureTipsPanel tab="lighting" onSettingsFocusRequest={focusBridgeSettings} />
          </div>

          <div
            className={`control-page remapping-page ${activeControlTab === 'remapping' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-remapping"
            aria-labelledby="control-tab-remapping"
            aria-hidden={activeControlTab !== 'remapping'}
          >
              <div className="feature-heading system-heading remapping-heading">
                <div>
                  <h2>Button Remapping</h2>
                  <p>Choose replacement targets for controller button slots.</p>
                </div>
                <div className="profile-controls">
                  <CustomSelect
                    value={selectedRemapProfileId}
                    disabled={pendingAction !== null}
                    options={remapProfileOptions}
                    ariaLabel="Button remapping profile"
                    onChange={selectButtonRemappingProfile}
                  />
                  <button
                    className="heading-action"
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={restoreButtonRemappingDefaults}
                  >
                    <RefreshCcw size={18} />
                    Restore Defaults
                  </button>
                </div>
              </div>
              <section className="feature-card remapping-card">
                <div className="remapping-profile-strip">
                  <ProfileSaveStatus />
                  <div className="remapping-profile-actions">
                    <button
                      type="button"
                      disabled={pendingAction !== null || selectedRemapProfileIsDefault || selectedRemapProfileIsGameOwned}
                      onClick={renameButtonRemappingProfile}
                    >
                      <Pencil size={15} />
                      Rename Profile
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={saveButtonRemappingProfile}
                    >
                      <Save size={15} />
                      Save New Profile
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction !== null || selectedRemapProfileIsDefault || selectedRemapProfileIsGameOwned}
                      onClick={deleteButtonRemappingProfile}
                    >
                      <Trash2 size={15} />
                      Delete Profile
                    </button>
                  </div>
                </div>
                <div className="remapping-layout" ref={remappingLayoutRef}>
                  <svg className="remapping-callout-layer" aria-hidden="true">
                    {remapCalloutLayout && (
                      <g>
                        {REMAP_STANDARD_BUTTON_IDS.map((buttonId) => {
                          const remapped = remapDraft[buttonId] !== buttonId;
                          return (
                            <g key={buttonId} className={hoveredRemapButton === buttonId || remapped ? 'active' : undefined}>
                              <polyline
                                className="remapping-callout-underlay"
                                points={remapCalloutLayout[buttonId].points}
                              />
                              <polyline
                                className="remapping-callout-line"
                                points={remapCalloutLayout[buttonId].points}
                              />
                            </g>
                          );
                        })}
                      </g>
                    )}
                    {showDualSenseEdgeRemapButtons && edgeRemapControlLayout && (
                      <g>
                        {REMAP_EDGE_BUTTON_IDS.map((buttonId) => {
                          const remapped = remapDraft[buttonId] !== buttonId;
                          return (
                            <g key={buttonId} className={hoveredRemapButton === buttonId || remapped ? 'active' : undefined}>
                              <polyline
                                className="remapping-callout-underlay"
                                points={edgeRemapControlLayout[buttonId].linePoints}
                              />
                              <polyline
                                className="remapping-callout-line"
                                points={edgeRemapControlLayout[buttonId].linePoints}
                              />
                            </g>
                          );
                        })}
                      </g>
                    )}
                  </svg>
                  {showDualSenseEdgeRemapButtons && (
                    <div className="remapping-edge-layer" aria-label="DualSense Edge button mappings">
                      {REMAP_EDGE_BUTTON_IDS.map((buttonId) => {
                        const button = REMAP_BUTTONS[buttonId];
                        const targetOptions = remapTargetOptionsFor(buttonId);
                        const remapped = remapDraft[buttonId] !== buttonId;
                        const fallbackPoint = REMAP_EDGE_CONTROL_POINTS[buttonId];
                        const edgeLayout = edgeRemapControlLayout?.[buttonId];
                        const anchor = edgeLayout?.anchor ?? fallbackPoint.anchor;
                        return (
                          <div
                            className={`remapping-pill remapping-pill-edge remapping-pill-edge-compact remapping-edge-control remapping-edge-control-${anchor} ${remapped ? 'changed' : ''}`}
                            data-remap-button-id={buttonId}
                            key={buttonId}
                            onMouseEnter={() => setHoveredRemapButton(buttonId)}
                            onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                            onFocusCapture={() => setHoveredRemapButton(buttonId)}
                            onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                            style={{
                              left: edgeLayout ? `${edgeLayout.left}px` : `${(fallbackPoint.x / remappingLayoutAsset.viewBoxWidth) * 100}%`,
                              top: edgeLayout ? `${edgeLayout.top}px` : `${(fallbackPoint.y / remappingLayoutAsset.viewBoxHeight) * 100}%`
                            } as CSSProperties}
                          >
                            <CustomSelect
                              value={remapDraft[buttonId]}
                              options={targetOptions}
                              className="remapping-select remapping-edge-select"
                              showSelectedCheck={false}
                              ariaLabel={`${button.label} remap target`}
                              renderValue={(label, value) => <RemapGlyphOption label={label} value={value} />}
                              renderOption={(label, value) => <RemapGlyphOption label={label} value={value} />}
                              onChange={(value) => setButtonRemap(buttonId, value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="remapping-side remapping-side-left" ref={remappingLeftSideRef} aria-label="Left side button mappings">
                    {REMAP_LEFT_BUTTON_IDS.map((buttonId) => {
                      const button = REMAP_BUTTONS[buttonId];
                      const targetOptions = remapTargetOptionsFor(buttonId);
                      const remapped = remapDraft[buttonId] !== buttonId;
                      return (
                        <div
                          className={`remapping-pill ${remapped ? 'changed' : ''}`}
                          data-remap-button-id={buttonId}
                          key={buttonId}
                          onMouseEnter={() => setHoveredRemapButton(buttonId)}
                          onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                          onFocusCapture={() => setHoveredRemapButton(buttonId)}
                          onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                          style={{
                            '--remapping-callout-top': remapCalloutLayout
                              ? `${remapCalloutLayout[buttonId].top}px`
                              : `${(remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * 100}%`
                          } as CSSProperties}
                        >
                          <span className="remapping-source">
                            <RemapSourceGlyph button={button} />
                          </span>
                          <span className="remapping-arrow" aria-hidden="true">
                            <ArrowRight size={15} />
                          </span>
                          <CustomSelect
                            value={remapDraft[buttonId]}
                            options={targetOptions}
                            className="remapping-select"
                            showSelectedCheck={false}
                            ariaLabel={`${button.label} remap target`}
                            renderValue={(label, value) => <RemapGlyphOption label={label} value={value} />}
                            renderOption={(label, value) => <RemapGlyphOption label={label} value={value} />}
                            onChange={(value) => setButtonRemap(buttonId, value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="remapping-controller-stage" aria-hidden="true">
                    <img
                      ref={remappingArtRef}
                      className="remapping-controller-art"
                      src={remappingLayoutAsset.src}
                      alt=""
                      style={{
                        '--remapping-art-aspect': remappingLayoutAsset.viewBoxWidth / remappingLayoutAsset.viewBoxHeight
                      } as CSSProperties}
                    />
                  </div>
                  <div className="remapping-side remapping-side-right" ref={remappingRightSideRef} aria-label="Right side button mappings">
                    {REMAP_RIGHT_BUTTON_IDS.map((buttonId) => {
                      const button = REMAP_BUTTONS[buttonId];
                      const targetOptions = remapTargetOptionsFor(buttonId);
                      const remapped = remapDraft[buttonId] !== buttonId;
                      return (
                        <div
                          className={`remapping-pill ${remapped ? 'changed' : ''}`}
                          data-remap-button-id={buttonId}
                          key={buttonId}
                          onMouseEnter={() => setHoveredRemapButton(buttonId)}
                          onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                          onFocusCapture={() => setHoveredRemapButton(buttonId)}
                          onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                          style={{
                            '--remapping-callout-top': remapCalloutLayout
                              ? `${remapCalloutLayout[buttonId].top}px`
                              : `${(remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * 100}%`
                          } as CSSProperties}
                        >
                          <span className="remapping-source">
                            <RemapSourceGlyph button={button} />
                          </span>
                          <span className="remapping-arrow" aria-hidden="true">
                            <ArrowRight size={15} />
                          </span>
                          <CustomSelect
                            value={remapDraft[buttonId]}
                            options={targetOptions}
                            className="remapping-select"
                            showSelectedCheck={false}
                            ariaLabel={`${button.label} remap target`}
                            renderValue={(label, value) => <RemapGlyphOption label={label} value={value} />}
                            renderOption={(label, value) => <RemapGlyphOption label={label} value={value} />}
                            onChange={(value) => setButtonRemap(buttonId, value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
          </div>

          <div
            className={`control-page chords-page ${activeControlTab === 'chords' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-chords"
            aria-labelledby="control-tab-chords"
            aria-hidden={activeControlTab !== 'chords'}
          >
              <div className="feature-heading chords-heading">
                <div>
                  <h2>Chords</h2>
                  <p>Assign reusable functions to controller buttons and starter chords.</p>
                </div>
              </div>

              <div className="chords-layout">
                <section className="feature-card chords-card chords-function-card">
                  <div className="feature-card-title">
                    <span className="feature-icon">
                      <IconBooks size={24} />
                    </span>
                    <div className="title-copy">
                      <h3>Function Library</h3>
                      <p>Create actions.</p>
                    </div>
                  </div>

                  <div className="chords-function-strip">
                    <CustomSelect
                      value={selectedChordFunction?.id ?? ''}
                      options={chordFunctionOptions}
                      disabled={pendingAction !== null || chordFunctions.length === 0}
                      ariaLabel="Chord function"
                      className="chords-function-select"
                      closeOnSelect={false}
                      suspendOutsideClose={chordFunctionDialog !== null}
                      onChange={(value) => {
                        const next = chordFunctions.find((func) => func.id === value) ?? null;
                        setSelectedChordFunctionId(value);
                        setChordFunctionDraft(chordFunctionToDraft(next));
                      }}
                      renderMenuFooter={() => (
                        selectedChordFunction ? (
                          <div className="trigger-lab-profile-actions chords-function-menu-actions">
                            <button
                              type="button"
                              title="Rename"
                              disabled={pendingAction !== null}
                              onClick={() => {
                                openChordFunctionDialog('rename');
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              disabled={pendingAction !== null}
                              onClick={() => {
                                openChordFunctionDialog('delete');
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : null
                      )}
                    />
                    <button
                      className="heading-icon-action chords-new-function-button"
                      type="button"
                      title="New Function"
                      aria-label="New Function"
                      disabled={pendingAction !== null}
                      onClick={createChordFunction}
                    >
                      <Plus size={17} />
                    </button>
                  </div>

                  {selectedChordFunction ? (
                    <div className="chords-editor">
                      <label className="chords-field chords-inline-field">
                        <span>Type</span>
                        <CustomSelect
                          value={chordFunctionDraft.type}
                          options={CHORD_FUNCTION_TYPE_OPTIONS}
                          disabled={pendingAction !== null}
                          ariaLabel="Chord function type"
                          onChange={(value) => {
                            const nextDraft = { ...chordFunctionDraft, type: value };
                            setChordFunctionDraft(nextDraft);
                            commitChordFunctionDraft(nextDraft);
                          }}
                        />
                      </label>

                      {chordFunctionDraft.type === 'keyboard' && (
                        <div
                          className="chords-keyboard-shortcut-builder"
                          aria-label="Keyboard shortcut"
                          style={{
                            '--chords-keyboard-key-label-width': `${CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH}ch`
                          } as CSSProperties}
                        >
                          <CustomSelect
                            className="chords-keyboard-key-select"
                            value={chordFunctionDraft.keyboardKey}
                            options={CHORD_KEYBOARD_KEY_OPTIONS}
                            disabled={pendingAction !== null}
                            ariaLabel="Keyboard shortcut key"
                            onChange={setChordFunctionKeyboardKey}
                          />
                          <div className="chords-keyboard-modifiers" aria-label="Keyboard shortcut modifiers">
                            {CHORD_KEYBOARD_MODIFIER_OPTIONS.map(([label, modifier]) => {
                              const active = chordFunctionDraft.keyboardModifiers.includes(modifier);
                              const unavailable = !active
                                && chordFunctionDraft.keyboardModifiers.length >= MAX_KEYBOARD_FUNCTION_KEYS - 1;
                              return (
                                <button
                                  key={modifier}
                                  type="button"
                                  className={active ? 'active' : ''}
                                  aria-pressed={active}
                                  disabled={pendingAction !== null || unavailable}
                                  onClick={() => toggleChordFunctionKeyboardModifier(modifier)}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {chordFunctionDraft.type === 'media' && (
                        <label className="chords-field chords-inline-field">
                          <span>Action</span>
                          <CustomSelect
                            value={chordFunctionDraft.mediaAction}
                            options={CHORD_MEDIA_ACTION_OPTIONS}
                            disabled={pendingAction !== null}
                            ariaLabel="Chord media action"
                            onChange={(value) => {
                              const nextDraft = { ...chordFunctionDraft, mediaAction: value };
                              setChordFunctionDraft(nextDraft);
                              commitChordFunctionDraft(nextDraft);
                            }}
                          />
                        </label>
                      )}

                      {chordFunctionDraft.type === 'controller-setting' && (
                        <label className="chords-field chords-inline-field">
                          <span>Action</span>
                          <CustomSelect
                            value={chordControllerSettingSelectValue(chordFunctionDraft.controllerAction)}
                            options={CHORD_CONTROLLER_SETTING_ACTION_OPTIONS}
                            disabled={pendingAction !== null}
                            ariaLabel="Chord controller setting action"
                            onChange={(value) => {
                              const nextDraft = {
                                ...chordFunctionDraft,
                                controllerAction: chordControllerSettingActionFromSelectValue(
                                  value,
                                  chordFunctionDraft.controllerAction
                                )
                              };
                              setChordFunctionDraft(nextDraft);
                              commitChordFunctionDraft(nextDraft);
                            }}
                          />
                        </label>
                      )}

                      {renderChordFunctionSummary(selectedChordFunction)}
                    </div>
                  ) : (
                    <div className="chords-empty">
                      <IconReplace size={26} />
                      <strong>No functions yet</strong>
                      <span>Create a function, then bind it to a button or chord.</span>
                    </div>
                  )}
                </section>

                <section className="feature-card chords-card chords-assignment-card">
                  <div className="feature-card-title">
                    <span className="feature-icon">
                      <IconDeviceGamepad3 size={24} />
                    </span>
                    <div className="title-copy">
                      <h3>Assignments</h3>
                      <p>{chordAssignmentsSubtitle}</p>
                    </div>
                    {chordAssignmentConflictState.conflictCount > 0 ? (
                      <span className="chords-conflict-badge" title="Duplicate, inactive, or shortcut-shadowed chord bindings">
                        <strong>{chordAssignmentConflictState.conflictCount}x</strong>
                        {chordAssignmentConflictState.conflictCount === 1 ? 'Conflict' : 'Conflicts'}
                      </span>
                    ) : null}
                  </div>

                  <div className="chords-assignment-builder">
                    <button
                      className="heading-action chords-new-chord-button"
                      type="button"
                      disabled={pendingAction !== null || !canAddChordDraft}
                      onClick={addChordAssignmentDraft}
                    >
                      <IconReplace size={18} />
                      New Chord
                    </button>
                  </div>

                  <div className="chords-assignment-scroll-region">
                    <div
                      className="chords-assignment-list"
                      ref={chordAssignmentListRef}
                      aria-label="Chord assignments"
                      onScroll={updateChordAssignmentScrollbar}
                    >
                      {chordAssignments.length + chordAssignmentDraftRows.length > 0 ? (
                        <>
                        {chordAssignmentDraftRows.map((row) => {
                          const func = chordFunctions.find((candidate) => candidate.id === row.functionId);
                          const starterOptions = chordStarterOptionsFor(row.starter);
                          const isInactiveMuteChord = muteChordStarterIsInactive(row.starter);
                          return (
                            <div
                              className={[
                                'chords-assignment-row',
                                'draft',
                                isInactiveMuteChord ? 'mute-starter-inactive' : ''
                              ].filter(Boolean).join(' ')}
                              key={row.id}
                            >
                              <div
                                className="chords-assignment-binding"
                                aria-label="New chord"
                                title="New chord"
                              >
                                  <CustomSelect
                                  value={row.starter}
                                  options={starterOptions}
                                  disabled={pendingAction !== null}
                                  className="chords-inline-glyph-select chords-inline-starter-select"
                                  floatingMenu
                                  floatingMenuMinWidth={72}
                                  showSelectedCheck={false}
                                  ariaLabel="Chord starter"
                                  renderValue={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                                  renderOption={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                                  onChange={(value) => updateChordAssignmentDraftStarter(row.id, value)}
                                />
                                <span className="chords-binding-connector" aria-hidden="true" />
                                <CustomSelect
                                  value={row.button ?? CHORD_UNASSIGNED_BUTTON}
                                  options={chordButtonOptionsFor(row.starter, true)}
                                  disabled={pendingAction !== null}
                                  className="chords-inline-glyph-select chords-inline-button-select"
                                  floatingMenu
                                  floatingMenuMinWidth={72}
                                  showSelectedCheck={false}
                                  ariaLabel="Chord button"
                                  renderValue={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                                  renderOption={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                                  onChange={(value) => updateChordAssignmentDraftButton(row.id, value)}
                                />
                              </div>
                              <span className="chords-function-connector" aria-hidden="true" />
                              <CustomSelect
                                value={row.functionId}
                                options={chordFunctionOptions}
                                disabled={pendingAction !== null}
                                className="chords-assignment-function-select"
                                floatingMenu
                                ariaLabel="New chord function"
                                renderValue={(label) => (
                                  <span className="chords-function-option">
                                    <strong>{label}</strong>
                                    <small>{func ? chordFunctionSummary(func) : 'Missing function'}</small>
                                  </span>
                                )}
                                renderOption={(label, value) => {
                                  const optionFunction = chordFunctions.find((candidate) => candidate.id === value);
                                  return (
                                    <span className="chords-function-option">
                                      <strong>{label}</strong>
                                      <small>{optionFunction ? chordFunctionSummary(optionFunction) : 'Missing function'}</small>
                                    </span>
                                  );
                                }}
                                onChange={(value) => updateChordAssignmentDraftFunction(row.id, value)}
                              />
                              <button
                                className="heading-icon-action"
                                type="button"
                                title="Remove assignment"
                                disabled={pendingAction !== null}
                                onClick={() => deleteChordAssignmentDraft(row.id)}
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                          );
                        })}
                        {chordAssignments.map((assignment, assignmentIndex) => {
                        const func = chordFunctions.find((candidate) => candidate.id === assignment.functionId);
                        const hasConflict = chordAssignmentConflictState.conflictKeys.has(chordAssignmentKey(assignment));
                        const starterOptions = chordStarterOptionsFor(assignment.starter);
                        const isInactiveMuteChord = muteChordStarterIsInactive(assignment.starter);
                        const dropPlacement = chordAssignmentDropHint?.targetId === assignment.id
                          ? chordAssignmentDropHint.placement
                          : null;
                        return (
                          <div
                            className={[
                              'chords-assignment-row',
                              hasConflict ? 'conflict' : '',
                              isInactiveMuteChord ? 'mute-starter-inactive' : '',
                              draggedChordAssignmentId === assignment.id ? 'dragging' : '',
                              dropPlacement === 'before' ? 'drop-before' : '',
                              dropPlacement === 'after' ? 'drop-after' : '',
                              assignmentIndex === 0 && dropPlacement === 'before' ? 'drop-list-start' : ''
                            ].filter(Boolean).join(' ')}
                            key={assignment.id}
                            data-assignment-id={assignment.id}
                            onPointerDown={(event) => startChordAssignmentPointerDrag(event, assignment.id)}
                          >
                            <div
                              className="chords-assignment-binding"
                              aria-label={chordAssignmentLabel(assignment)}
                              title={chordAssignmentLabel(assignment)}
                            >
                                <CustomSelect
                                value={assignment.starter}
                                options={starterOptions}
                                disabled={pendingAction !== null}
                                className="chords-inline-glyph-select chords-inline-starter-select"
                                floatingMenu
                                floatingMenuMinWidth={72}
                                showSelectedCheck={false}
                                ariaLabel={`${chordAssignmentLabel(assignment)} starter`}
                                renderValue={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                                renderOption={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                                onChange={(value) => updateChordAssignmentStarter(assignment.id, value)}
                              />
                              <span className="chords-binding-connector" aria-hidden="true" />
                              <CustomSelect
                                value={assignment.button}
                                options={chordButtonOptionsFor(assignment.starter)}
                                disabled={pendingAction !== null}
                                className="chords-inline-glyph-select chords-inline-button-select"
                                floatingMenu
                                floatingMenuMinWidth={72}
                                showSelectedCheck={false}
                                ariaLabel={`${chordAssignmentLabel(assignment)} button`}
                                renderValue={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                                renderOption={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                                onChange={(value) => updateChordAssignmentButton(assignment.id, value)}
                              />
                            </div>
                            <span className="chords-function-connector" aria-hidden="true" />
                            <CustomSelect
                              value={assignment.functionId}
                              options={chordFunctionOptions}
                              disabled={pendingAction !== null}
                              className="chords-assignment-function-select"
                              floatingMenu
                              ariaLabel={`${chordAssignmentLabel(assignment)} function`}
                              renderValue={(label) => (
                                <span className="chords-function-option">
                                  <strong>{label}</strong>
                                  <small>{func ? chordFunctionSummary(func) : 'Missing function'}</small>
                                </span>
                              )}
                              renderOption={(label, value) => {
                                const optionFunction = chordFunctions.find((candidate) => candidate.id === value);
                                return (
                                  <span className="chords-function-option">
                                    <strong>{label}</strong>
                                    <small>{optionFunction ? chordFunctionSummary(optionFunction) : 'Missing function'}</small>
                                  </span>
                                );
                              }}
                              onChange={(value) => setChordAssignmentFunction(assignment.id, value)}
                            />
                            <button
                              className="heading-icon-action"
                              type="button"
                              title="Remove assignment"
                              disabled={pendingAction !== null}
                              onClick={() => deleteChordAssignment(assignment.id)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        );
                        })}
                        </>
                      ) : (
                        <div className="chords-empty chords-empty-assignments">
                          <IconDeviceGamepad3 size={26} />
                          <strong>No assignments</strong>
                          <span>Use New Chord to pair a starter, button, and function.</span>
                        </div>
                      )}
                    </div>
                    {chordAssignmentScrollbar.visible ? (
                      <div className="chords-assignment-scrollbar" aria-hidden="true">
                        <div
                          className="chords-assignment-scrollbar-thumb"
                          style={{
                            height: `${chordAssignmentScrollbar.height}px`,
                            transform: `translateY(${chordAssignmentScrollbar.top}px)`
                          }}
                          onPointerDown={startChordAssignmentScrollbarDrag}
                        />
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
          </div>

          <div
            className={`control-page system-page ${activeControlTab === 'system' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-system"
            aria-labelledby="control-tab-system"
            aria-hidden={activeControlTab !== 'system'}
          >
              <div className="feature-heading system-heading">
                <div>
                  <h2>System</h2>
                  <p>Configure bridge behavior and defaults.</p>
                </div>
                <div className="profile-controls">
                  <button
                    className="heading-icon-action emergency-repair-button"
                    type="button"
                    title="Emergency device repair"
                    aria-label="Emergency device repair"
                    disabled={pendingAction !== null}
                    onClick={openDeviceCleanupConfirm}
                  >
                    <IconTool size={20} />
                  </button>
                  <CustomSelect
                    value={selectedControllerProfileId}
                    disabled={!connected || pendingAction !== null}
                    options={controllerProfileOptions}
                    ariaLabel="System profile"
                    onChange={selectControllerProfile}
                  />
                  <button
                    className="heading-action"
                    type="button"
                    disabled={!connected || pendingAction !== null || hapticsCommitPending || speakerVolumeCommitPending || lightbarCommitPending}
                    onClick={() => void runAction('restore', () => window.bridge.restoreDefaults())}
                  >
                    <RefreshCcw size={18} />
                    Restore Defaults
                  </button>
                </div>
              </div>

              <div className="feature-card-grid">
                <section className="system-card mute-card">
                  <div className="feature-card-title system-card-heading">
                    <span className="feature-icon system-icon icon-wide"><MicOff size={20} /></span>
                    <div className="title-copy">
                      <h3>Mute Button</h3>
                      <p>Set controller mute behavior.</p>
                    </div>
                  </div>
                  <div className="system-fields">
                    <div className="select-row">
                      <span>Behavior</span>
                      <CustomSelect
                        value={snapshot.settings.muteButtonMode}
                        disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                        options={MUTE_BUTTON_MODE_OPTIONS}
                        ariaLabel="Mute button behavior"
                        onChange={(mode) => setMuteButtonAction(mode)}
                      />
                    </div>
                    {snapshot.settings.muteButtonMode === 'keyboard' && (
                      <>
                        <div className="select-row">
                          <span>Key</span>
                          <CustomSelect
                            value={snapshot.settings.muteKeyboardUsage}
                            disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                            options={MUTE_KEY_OPTIONS}
                            ariaLabel="Mute keyboard key"
                            onChange={(usage) => setMuteButtonAction('keyboard', usage)}
                          />
                        </div>
                        <div className="select-row">
                          <span>Press Mode</span>
                          <CustomSelect
                            value={snapshot.settings.muteKeyboardBehavior}
                            disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                            options={MUTE_KEYBOARD_BEHAVIOR_OPTIONS}
                            ariaLabel="Mute keyboard press mode"
                            onChange={(behavior) => setMuteButtonAction('keyboard', undefined, undefined, behavior)}
                          />
                        </div>
                        <div className="modifier-block">
                          <div className="modifier-grid" aria-label="Keyboard modifiers">
                            {MUTE_MODIFIER_OPTIONS.map(([label, bit]) => {
                              const enabled = (snapshot.settings.muteKeyboardModifiers & bit) !== 0;
                              return (
                                <button
                                  key={bit}
                                  type="button"
                                  className={enabled ? 'active' : ''}
                                  disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                                  onClick={() => setMuteModifier(bit, !enabled)}
                                >
                                  <Keyboard size={16} />
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="select-row">
                          <span
                            className="settings-menu-copy-tooltip chord-starter-label"
                            tabIndex={0}
                            aria-describedby="mute-chord-starter-tooltip"
                          >
                            Chord Starter
                            <span
                              id="mute-chord-starter-tooltip"
                              className="settings-shortcut-tooltip chord-starter-tooltip"
                              role="tooltip"
                            >
                              Lets Mute start a chord. When enabled, the keyboard key waits 250ms so a chord can be detected first.
                            </span>
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={snapshot.settings.muteKeyboardChordStarterEnabled}
                            className={`switch ${snapshot.settings.muteKeyboardChordStarterEnabled ? 'on' : ''}`}
                            disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                            onClick={() => setMuteButtonAction(
                              'keyboard',
                              undefined,
                              undefined,
                              undefined,
                              !snapshot.settings.muteKeyboardChordStarterEnabled
                            )}
                          >
                            <span />
                          </button>
                        </div>
                      </>
                    )}
                    {snapshot.settings.muteButtonMode === 'quiet' && (
                      <div className={`quiet-state ${snapshot.status?.quietModeEnabled ? 'active' : ''}`}>
                        <VolumeX size={18} />
                        <span>{snapshot.status?.quietModeEnabled ? 'Controller Quiet On' : 'Controller Quiet Off'}</span>
                      </div>
                    )}
                  </div>
                </section>

                <section className={`system-card device-card ${showDiagnostics ? 'expanded' : ''}`}>
                  <div className="feature-card-title system-card-heading">
                    <span className="feature-icon system-icon icon-wide">
                      {showDiagnostics ? <IconStethoscope size={20} /> : <Settings2 size={20} />}
                    </span>
                    <div className="title-copy">
                      <h3>{showDiagnostics ? 'Diagnostics' : 'Device'}</h3>
                        <p>
                          {showDiagnostics
                            ? 'Debug Data'
                            : 'Firmware'}
                        </p>
                    </div>
                    <div className="dual-selector system-mode-selector" role="tablist" aria-label="System control mode">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!showDiagnostics}
                        className={!showDiagnostics ? 'active' : ''}
                        onClick={() => setShowDiagnostics(false)}
                      >
                        Device
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={showDiagnostics}
                        className={showDiagnostics ? 'active' : ''}
                        onClick={() => setShowDiagnostics(true)}
                      >
                        Diagnostics
                      </button>
                    </div>
                  </div>
                  {showDiagnostics ? (
                    <div className="device-diagnostics">
                      <dl>
                        <div><dt>Protocol</dt><dd>{snapshot.diagnostics.protocolVersion ?? '--'}</dd></div>
                        <div>
                          <dt>Uptime</dt>
                          <dd>
                            <UptimeValue
                              active={diagnosticsVisible}
                              lastPollAt={snapshot.diagnostics.lastPollAt}
                              uptimeSeconds={snapshot.diagnostics.uptimeSeconds}
                            />
                          </dd>
                        </div>
                        <div>
                          <dt>Revision</dt>
                          <dd><span className="diagnostic-number">{snapshot.diagnostics.settingsRevision ?? '--'}</span></dd>
                        </div>
                        <div><dt>Last ACK</dt><dd>{ackText}</dd></div>
                        <div><dt>HID Path</dt><dd>{snapshot.diagnostics.hidPath ?? '--'}</dd></div>
                        <div>
                          <dt>Audio Log</dt>
                          <dd title={snapshot.diagnostics.audioDebugLogPath ?? undefined}>
                            {snapshot.diagnostics.audioDebugLogPath ?? '--'}
                          </dd>
                        </div>
                        <div>
                          <dt>Dropped</dt>
                          <dd><span className="diagnostic-number">{snapshot.diagnostics.audioDebugDroppedCount}</span></dd>
                        </div>
                        <div>
                          <dt>Trigger Drop</dt>
                          <dd><span className="diagnostic-number">{snapshot.diagnostics.triggerTraceDroppedCount}</span></dd>
                        </div>
                        <div>
                          <dt>Feedback Drop</dt>
                          <dd><span className="diagnostic-number">{snapshot.diagnostics.feedbackTraceDroppedCount}</span></dd>
                        </div>
                        <div className="debug-entry">
                          <dt>Audio Debug</dt>
                          <dd>
                            <textarea readOnly value={audioDebugText} aria-label="Audio debug copy text" />
                          </dd>
                        </div>
                        <div className="debug-entry">
                          <dt>Audio Events</dt>
                          <dd>
                            <textarea readOnly value={audioEventLogText} aria-label="Audio event log text" />
                          </dd>
                        </div>
                        <div className="debug-entry">
                          <dt>Trigger Trace</dt>
                          <dd>
                            <textarea readOnly value={triggerTraceText} aria-label="Trigger trace text" />
                          </dd>
                        </div>
                        <div className="debug-entry">
                          <dt>Feedback Trace</dt>
                          <dd>
                            <textarea readOnly value={feedbackTraceText} aria-label="Feedback trace text" />
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : (
                    <div className="device-list">
                      <div className="device-row">
                        <span>Firmware</span>
                        <strong>{snapshot.status?.firmwareVersion ?? '--'}</strong>
                      </div>
                      <div className="device-row">
                        <span>Controller</span>
                        <strong>{controllerConnected ? controllerName(snapshot.status?.controllerType) : '--'}</strong>
                      </div>
                      <div className="device-row device-control-row">
                        <span>Polling Rate</span>
                        <CustomSelect
                          value={snapshot.settings.pollingRateMode}
                          disabled={!connected || !pollingRateControlSupported || pendingAction !== null}
                          options={POLLING_RATE_OPTIONS}
                          ariaLabel="Polling rate"
                          onChange={setPollingRateMode}
                        />
                      </div>
                      <div className="device-row device-control-row">
                        <span>Host Controller</span>
                        <CustomSelect
                          value={snapshot.settings.hostPersonaMode}
                          disabled={!connected || !hostPersonaControlSupported || pendingAction !== null || personaTransitionActive}
                          options={hostPersonaOptions.length > 0 ? hostPersonaOptions : HOST_PERSONA_OPTIONS.slice(0, 1)}
                          className="host-persona-selector"
                          ariaLabel="Host controller persona"
                          getOptionClassName={(_, mode) => (mode === 'xbox' ? 'host-persona-platform-break' : undefined)}
                          renderValue={(label, mode) => <HostPersonaOption label={label} value={mode} />}
                          renderOption={(label, mode) => <HostPersonaOption label={label} value={mode} />}
                          onChange={setHostPersonaMode}
                        />
                      </div>
                      <div className="device-row device-status-row">
                        <span>Status</span>
                        <strong className={`health-label ${systemHealthTone}`}>
                          <span className={`dot ${systemHealthTone === 'good' ? statusTone : systemHealthTone}`} />
                          {healthLabel(snapshot)}
                        </strong>
                      </div>
                    </div>
                  )}
                </section>
              </div>
              <section className="feature-help-panel system-profile-panel" aria-label="System profiles and tips">
                <div className="system-profile-strip">
                  <ProfileSaveStatus />
                  <div className="remapping-profile-actions">
                    <button
                      type="button"
                      disabled={selectedControllerProfileIsDefault || selectedControllerProfileIsGameOwned || pendingAction !== null}
                      onClick={renameControllerProfile}
                    >
                      <Pencil size={15} />
                      Rename Profile
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={saveControllerProfile}
                    >
                      <Save size={15} />
                      Save New Profile
                    </button>
                    <button
                      type="button"
                      disabled={!canDeleteControllerProfile || pendingAction !== null}
                      onClick={deleteControllerProfile}
                    >
                      <Trash2 size={15} />
                      Delete Profile
                    </button>
                  </div>
                </div>
                <SystemProfileSummary
                  settings={controllerProfileSettingsFromSnapshot(snapshot)}
                  powerSavingActive={controllerPowerSavingActive}
                />
              </section>
          </div>
        </div>
      </section>
      </main>

      {startupTutorialStep !== 'done' && (
        <StartupTutorial
          featureExampleActive={startupTutorialFeatureActive}
          onFeatureExampleToggle={() => setStartupTutorialFeatureActive((active) => !active)}
          onFinish={() => {
            saveStartupTutorialCompleted();
            setStartupTutorialStep('done');
          }}
        />
      )}

      {deviceCleanupConfirmVisible && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeDeviceCleanupConfirm}
        >
          <form
            className="settings-menu bridge-settings-modal device-cleanup-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Emergency device repair"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void runWindowsDeviceCleanup();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <IconTool size={16} />
                <span>Emergency Device Repair</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close emergency device repair dialog"
                disabled={pendingAction === 'device-cleanup'}
                onClick={closeDeviceCleanupConfirm}
              >
                <X size={16} />
              </button>
            </div>
            <div className="device-cleanup-copy">
              <p>
                Only run this if you are running into persistent odd controller, rumble, haptics, audio, or Windows device issues.
              </p>
              <p>
                Disconnect the controller from the bridge before running this repair.
              </p>
              <ul>
                <li>Removes stale Windows DualSense, DualSense Edge, DS5 Bridge USB/HID, audio endpoint, and Bluetooth pairing records.</li>
                <li>Controller identity based profiles in Steam, emulators, or other tools may need to be assigned again.</li>
                <li>DualSense controllers paired directly to Windows over Bluetooth may need to be paired again.</li>
              </ul>
              {controllerConnected && (
                <div className="device-cleanup-alert bad">
                  Controller is still connected to the bridge.
                </div>
              )}
              {deviceCleanupError && (
                <div className="device-cleanup-alert bad">
                  {deviceCleanupError}
                </div>
              )}
              {deviceCleanupMessage && (
                <div className="device-cleanup-alert good">
                  {deviceCleanupMessage}
                </div>
              )}
            </div>
            <div className="remap-profile-dialog-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={pendingAction === 'device-cleanup'}
                onClick={closeDeviceCleanupConfirm}
              >
                Close
              </button>
              <button
                type="submit"
                className="primary-action danger"
                disabled={pendingAction !== null || controllerConnected}
              >
                {pendingAction === 'device-cleanup' ? 'Running...' : 'Run Repair'}
              </button>
            </div>
          </form>
        </div>
      )}

      {chordFunctionDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeChordFunctionDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Chord function"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitChordFunctionDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {chordFunctionDialog.mode === 'delete' ? <Trash2 size={16} /> : <Pencil size={16} />}
                <span>
                  {chordFunctionDialog.mode === 'delete' ? 'Delete Function' : 'Rename Function'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close chord function dialog"
                onClick={closeChordFunctionDialog}
              >
                <X size={16} />
              </button>
            </div>
            {chordFunctionDialog.mode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                Delete {chordFunctionDialogFunction?.name ?? 'this function'}?
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Function Name</span>
                <input
                  autoFocus
                  value={chordFunctionNameDraft}
                  maxLength={MAX_CHORD_FUNCTION_NAME_LENGTH}
                  onChange={(event) => setChordFunctionNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeChordFunctionDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${chordFunctionDialog.mode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (chordFunctionDialog.mode !== 'delete' && chordFunctionNameDraft.trim().length === 0)}
              >
                {chordFunctionDialog.mode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {triggerProfileDeleteConfirm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setTriggerProfileDeleteConfirm(null)}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete trigger profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void confirmDeleteTriggerProfile();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <Trash2 size={16} />
                <span>Delete Trigger Profile</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close delete trigger profile dialog"
                onClick={() => setTriggerProfileDeleteConfirm(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="remap-profile-dialog-copy">
              Delete {triggerProfileDeleteConfirm.name}?
            </p>
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={() => setTriggerProfileDeleteConfirm(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-action danger">
                Delete
              </button>
            </div>
          </form>
        </div>
      )}

      {gameCreateOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setGameCreateOpen(false)}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal game-create-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add game"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void submitGameCreate();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <Plus size={16} />
                <span>Add Game</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close add game dialog"
                onClick={() => setGameCreateOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="game-create-library">
              <div className="game-create-library-head">
                <span>From your libraries</span>
                <button
                  type="button"
                  className="secondary-action"
                  disabled={installedGamesLoading}
                  onClick={() => void loadInstalledGames(true)}
                >
                  {installedGamesLoading ? 'Scanning…' : 'Rescan'}
                </button>
              </div>
              {installedGamesLoading && installedGames === null ? (
                <p className="game-create-library-empty">Looking for Steam and Heroic games…</p>
              ) : installedGames === null || installedGames.games.length === 0 ? (
                <p className="game-create-library-empty">
                  No new Steam or Heroic games found — every installed game may already
                  have a profile, or the launchers aren't installed.
                </p>
              ) : (
                <div className="game-create-library-grid" role="listbox" aria-label="Installed games">
                  {installedGames.games.map((game) => (
                    <button
                      key={`${game.source}:${game.sourceId}`}
                      type="button"
                      role="option"
                      aria-selected={selectedInstalledGame?.sourceId === game.sourceId}
                      className={`game-create-library-tile ${selectedInstalledGame?.sourceId === game.sourceId ? 'selected' : ''}`}
                      onClick={() => pickInstalledGame(game)}
                    >
                      <span
                        className={`game-create-library-art ${game.cover ? 'has-image' : gameTileArtClass(game.sourceId)}`}
                        style={game.cover ? { backgroundImage: `url("${game.cover}")` } : undefined}
                        aria-hidden="true"
                      >
                        {!game.cover && <span className="game-tile-monogram">{gameTileMonogram(game.name)}</span>}
                      </span>
                      <span className="game-create-library-name">{game.name}</span>
                      <span className={`game-create-library-badge ${game.source}`}>
                        {game.source === 'steam' ? 'Steam' : 'Heroic'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {installedGames !== null && installedGames.errors.length > 0 && (
                <p className="game-create-library-errors">{installedGames.errors.join(' · ')}</p>
              )}
            </div>
            <label className="remap-profile-name-field">
              <span>Game Name</span>
              <input
                autoFocus
                value={gameCreateName}
                maxLength={100}
                placeholder="Cyberpunk 2077"
                onChange={(event) => setGameCreateName(event.target.value)}
              />
            </label>
            {selectedInstalledGame !== null && selectedInstalledGame.processCandidates.length > 0 && (
              <div className="game-create-candidate-ticks" role="group" aria-label="Detected executables">
                <span className="game-create-candidate-ticks-label">
                  Found in {selectedInstalledGame.name}'s folder — untick anything that isn't the game:
                </span>
                {selectedInstalledGame.processCandidates.map((candidate) => (
                  <label key={candidate} className="game-create-candidate-tick">
                    <input
                      type="checkbox"
                      checked={installedCandidateTicks[candidate] ?? false}
                      onChange={(event) => setInstalledCandidateTicks((ticks) => ({
                        ...ticks,
                        [candidate]: event.target.checked
                      }))}
                    />
                    <span>{candidate}</span>
                  </label>
                ))}
              </div>
            )}
            <label className="remap-profile-name-field">
              <span>{selectedInstalledGame ? 'Extra Process Names (optional)' : 'Process Names'}</span>
              <input
                value={gameCreateProcessesInput}
                placeholder="cyberpunk2077.exe"
                onChange={(event) => setGameCreateProcessesInput(event.target.value)}
              />
            </label>
            <div className="game-create-detect">
              <button
                type="button"
                className="secondary-action"
                disabled={gameCreateDetectLoading}
                onClick={() => void detectGameCreateProcesses()}
              >
                <SearchIcon size={14} />
                {gameCreateDetectLoading ? 'Scanning…' : 'Detect Running Game'}
              </button>
              {gameCreateCandidates !== null && (
                gameCreateCandidates.length === 0 ? (
                  <p className="game-create-detect-empty">No game processes found — is the game running?</p>
                ) : (
                  <div className="game-create-candidates">
                    {gameCreateCandidates.map((candidate) => (
                      <button
                        key={candidate.name}
                        type="button"
                        className="trigger-lab-chip compact"
                        onClick={() => setGameCreateProcessesInput((current) => (
                          mergeDetectedProcessName(current, candidate.name)
                        ))}
                      >
                        {candidate.name}
                      </button>
                    ))}
                  </div>
                )
              )}
            </div>
            <p className="remap-profile-dialog-copy">
              Trigger effects, per-game settings and cover art are added from the game's page afterwards.
            </p>
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={() => setGameCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary-action"
                disabled={gameCreateBusy || gameCreateName.trim().length === 0}
              >
                {gameCreateBusy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {gameArtworkDialogFor && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setGameArtworkDialogFor(null)}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal game-artwork-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Cover art"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void searchGameArtworkDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <IconPhoto size={16} />
                <span>Cover Art</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close cover art dialog"
                onClick={() => setGameArtworkDialogFor(null)}
              >
                <X size={16} />
              </button>
            </div>
            <label className="remap-profile-name-field">
              <span>SteamGridDB API Key</span>
              <input
                value={steamGridDbKeyDraft ?? snapshot?.settings.steamGridDbApiKey ?? ''}
                placeholder="Paste your API key"
                onChange={(event) => setSteamGridDbKeyDraft(event.target.value)}
              />
            </label>
            <p className="remap-profile-dialog-copy game-artwork-key-hint">
              Covers come from SteamGridDB. Keys are free:{' '}
              <button
                type="button"
                className="game-artwork-key-link"
                onClick={() => void window.bridge.openExternal('https://www.steamgriddb.com/profile/preferences/api')}
              >
                steamgriddb.com → Preferences → API
              </button>
            </p>
            <div className="game-artwork-search-row">
              <input
                className="game-artwork-search-input"
                value={gameArtworkQuery}
                placeholder="Search game title"
                aria-label="Search game title"
                onChange={(event) => setGameArtworkQuery(event.target.value)}
              />
              <button
                type="submit"
                className="primary-action"
                disabled={gameArtworkBusy || gameArtworkQuery.trim().length === 0}
              >
                <SearchIcon size={14} />
                {gameArtworkBusy ? 'Working…' : 'Search'}
              </button>
            </div>
            {gameArtworkError && <p className="game-artwork-error">{gameArtworkError}</p>}
            {gameArtworkResults !== null && gameArtworkResults.length > 0 && (
              <div className="game-artwork-results" role="listbox" aria-label="Search results">
                {gameArtworkResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className="game-artwork-result"
                    disabled={gameArtworkBusy}
                    onClick={() => void applyGameArtworkChoice(result)}
                  >
                    <IconPhoto size={14} />
                    <span>{result.name}</span>
                    <span className="game-artwork-result-hint">Use this cover</span>
                  </button>
                ))}
              </div>
            )}
            <div className="remap-profile-dialog-actions">
              {gameArtwork[gameArtworkDialogFor] && (
                <button
                  type="button"
                  className="secondary-action danger"
                  onClick={() => void removeGameArtworkChoice()}
                >
                  Remove Cover
                </button>
              )}
              <button type="button" className="secondary-action" onClick={() => setGameArtworkDialogFor(null)}>
                Close
              </button>
            </div>
          </form>
        </div>
      )}

      {gameProcessEditor && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setGameProcessEditor(null)}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Set game process names"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveGameProcessNames();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <IconTargetArrow size={16} />
                <span>Game Path</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close process names dialog"
                onClick={() => setGameProcessEditor(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="remap-profile-dialog-copy">
              Set which running executables activate {gameProcessEditor.name}.
            </p>
            <label className="trigger-profiles-process-field">
              <span>Process Names (comma-separated)</span>
              <input
                value={gameProcessEditorInput}
                placeholder="game.exe, other.exe"
                autoFocus
                onChange={(event) => setGameProcessEditorInput(event.target.value)}
              />
            </label>
            <div className="game-detect-anchor" ref={gameProcessDetectRef}>
              <button
                type="button"
                className="secondary-action game-detect-button"
                disabled={gameDetectLoading}
                onClick={() => void detectRunningGameForEditor()}
              >
                <SearchIcon size={14} />
                Detect running game
              </button>

              {gameProcessDetectOpen && (
                <div className="game-detect-popover" role="dialog" aria-label="Detected running games">
                  {gameDetectCandidates.length === 0 ? (
                    <p className="game-detect-empty">No game detected — is it running?</p>
                  ) : (
                    <ul className="game-detect-list">
                      {gameDetectCandidates.map((candidate) => (
                        <li key={candidate.name}>
                          <button
                            type="button"
                            className="game-detect-candidate"
                            onClick={() => pickDetectedGameProcessForEditor(candidate.name)}
                          >
                            <span className="game-detect-candidate-name">{candidate.name}</span>
                            {candidate.kind !== 'other' && (
                              <span className="game-detect-candidate-kind">
                                {candidate.kind === 'proton' ? 'Proton' : 'game path'}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={() => setGameProcessEditor(null)}>
                Cancel
              </button>
              <button type="submit" className="primary-action" disabled={gameProcessEditorSaving}>
                {gameProcessEditorSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {gameDeleteConfirm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setGameDeleteConfirm(null)}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete game profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void confirmDeleteGameProfile(false);
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <Trash2 size={16} />
                <span>Delete Game Profile</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close delete game profile dialog"
                onClick={() => setGameDeleteConfirm(null)}
              >
                <X size={16} />
              </button>
            </div>
            {(() => {
              const target = triggerProfiles.find((profile) => profile.id === gameDeleteConfirm.id);
              const hasEffects = target ? triggerProfileHasEffects(target) : false;
              return (
                <>
                  <p className="remap-profile-dialog-copy">
                    Delete {gameDeleteConfirm.name}? Its game settings and cover art are removed.
                    Your global settings are not affected.
                  </p>
                  {hasEffects && (
                    <div className="game-delete-triggers-warning" role="alert">
                      <strong>This game has custom trigger effects.</strong>
                      <span>
                        Delete them too, or keep them as a trigger profile in the Trigger
                        Profiles tab (it still applies when the game runs).
                      </span>
                    </div>
                  )}
                  <div className="remap-profile-dialog-actions">
                    <button type="button" className="secondary-action" onClick={() => setGameDeleteConfirm(null)}>
                      Cancel
                    </button>
                    {hasEffects && (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void confirmDeleteGameProfile(true)}
                      >
                        Keep Trigger Profile
                      </button>
                    )}
                    <button type="submit" className="primary-action danger">
                      {hasEffects ? 'Delete Everything' : 'Delete'}
                    </button>
                  </div>
                </>
              );
            })()}
          </form>
        </div>
      )}

      {triggerProfileResetConfirm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setTriggerProfileResetConfirm(null)}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Reset trigger profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void confirmResetTriggerProfile();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <RefreshCcw size={16} />
                <span>Reset Trigger Profile</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close reset trigger profile dialog"
                onClick={() => setTriggerProfileResetConfirm(null)}
              >
                <X size={16} />
              </button>
            </div>
            <p className="remap-profile-dialog-copy">
              {`Reset ${triggerProfileResetConfirm.name} to its library defaults? Your changes to this profile will be discarded.`}
            </p>
            <div className="remap-profile-dialog-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setTriggerProfileResetConfirm(null)}
              >
                Cancel
              </button>
              <button type="submit" className="primary-action" disabled={triggerProfileResetting}>
                {triggerProfileResetting ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          </form>
        </div>
      )}

      {remapProfileDialogMode && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeRemapProfileDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Button remapping profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitRemapProfileDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {remapProfileDialogMode === 'delete' ? <Trash2 size={16} /> : <Save size={16} />}
                <span>
                  {remapProfileDialogMode === 'save'
                    ? 'Save New Profile'
                    : remapProfileDialogMode === 'rename'
                      ? 'Rename Profile'
                      : 'Delete Profile'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close profile dialog"
                onClick={closeRemapProfileDialog}
              >
                <X size={16} />
              </button>
            </div>
            {remapProfileDialogMode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                Delete {selectedRemapProfile?.name ?? 'this profile'}?
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Profile Name</span>
                <input
                  autoFocus
                  value={remapProfileNameDraft}
                  maxLength={48}
                  onChange={(event) => setRemapProfileNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeRemapProfileDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${remapProfileDialogMode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (remapProfileDialogMode !== 'delete' && remapProfileNameDraft.trim().length === 0)}
              >
                {remapProfileDialogMode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {controllerProfileDialogMode && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeControllerProfileDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="System profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitControllerProfileDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {controllerProfileDialogMode === 'delete' ? <Trash2 size={16} /> : <Save size={16} />}
                <span>
                  {controllerProfileDialogMode === 'save'
                    ? 'Save New Profile'
                    : controllerProfileDialogMode === 'rename'
                      ? 'Rename Profile'
                      : 'Delete Profile'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close system profile dialog"
                onClick={closeControllerProfileDialog}
              >
                <X size={16} />
              </button>
            </div>
            {controllerProfileDialogMode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                Delete {selectedControllerProfile?.name ?? 'this profile'}?
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Profile Name</span>
                <input
                  autoFocus
                  value={controllerProfileNameDraft}
                  maxLength={48}
                  onChange={(event) => setControllerProfileNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeControllerProfileDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${controllerProfileDialogMode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (controllerProfileDialogMode !== 'delete' && controllerProfileNameDraft.trim().length === 0)}
              >
                {controllerProfileDialogMode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {triggerProfileLibraryOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setTriggerProfileLibraryOpen(false)}
        >
          <div
            className="settings-menu trigger-profiles-library-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Profile library"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-menu-heading trigger-profiles-library-heading">
              <div className="modal-heading-copy">
                <IconBooks size={16} />
                <span>Profile Library</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close profile library"
                onClick={() => setTriggerProfileLibraryOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="trigger-profiles-library-body">
              {triggerProfileLibraryLoading ? (
                <p className="trigger-profiles-library-empty">Loading library…</p>
              ) : !triggerProfileLibraryCatalog ? null : triggerProfileLibraryCatalog.entries.length === 0 ? (
                <div className="trigger-profiles-library-error">
                  <p>
                    {triggerProfileLibraryCatalog.error
                      ? `Couldn't load the profile library — ${triggerProfileLibraryCatalog.error}`
                      : 'The profile library has no profiles yet.'}
                  </p>
                  {triggerProfileLibraryCatalog.error ? (
                    <p>Browse profiles manually at https://github.com/LordVicky/OpenDS5</p>
                  ) : null}
                </div>
              ) : (
                <>
                  {triggerProfileLibraryCatalog.fromCache && (
                    <p className="trigger-profiles-library-stale">
                      {`Couldn't refresh — showing cached list from ${new Date(triggerProfileLibraryCatalog.fetchedAtMs).toLocaleString()}`}
                    </p>
                  )}
                  <div className="trigger-profiles-library-search">
                    <SearchIcon size={14} aria-hidden="true" />
                    <input
                      type="search"
                      value={triggerProfileLibraryQuery}
                      onChange={(event) => setTriggerProfileLibraryQuery(event.target.value)}
                      placeholder="Search a game…"
                      aria-label="Search the profile library"
                      autoFocus
                    />
                  </div>
                  {triggerProfileLibraryRows.length === 0 ? (
                    <div className="trigger-profiles-library-none">
                      <strong>{`No profile for “${triggerProfileLibraryQuery.trim()}” yet`}</strong>
                      <p>
                        Nobody has published one, and the game doesn&apos;t drive the triggers itself.
                        You can build one in Trigger Lab.
                      </p>
                    </div>
                  ) : (
                    <ul className="trigger-profiles-library-list">
                      {triggerProfileLibraryRows.map((row) =>
                        row.kind === 'native' ? (
                          <li key={row.key} className="trigger-profiles-library-entry">
                            <div className="trigger-profiles-library-entry-copy">
                              <span className="trigger-profiles-library-entry-title">
                                <strong>{row.game}</strong>
                              </span>
                              <p className="trigger-profiles-library-entry-description">
                                Drives its own triggers. OpenDS5 passes through — nothing to install.
                              </p>
                            </div>
                            <span className="library-pill library-pill-native">Native</span>
                          </li>
                        ) : (
                          <li key={row.key} className="trigger-profiles-library-entry">
                            <div className="trigger-profiles-library-entry-copy">
                              <span className="trigger-profiles-library-entry-title">
                                <strong>{row.entry.game}</strong>
                                <span className="trigger-profiles-library-entry-author">
                                  {[
                                    profileVariantLabel(row.entry.game, row.entry.name),
                                    row.entry.author ? `by ${row.entry.author}` : null,
                                    row.entry.origin
                                      ? `ported from ${row.entry.origin.from}`
                                      : null
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </span>
                              </span>
                              <p className="trigger-profiles-library-entry-description">
                                {row.entry.description}
                              </p>
                              {row.entry.capabilities ? (
                                <p className="trigger-profiles-library-entry-capabilities">
                                  {row.entry.capabilities}
                                </p>
                              ) : null}
                              {triggerProfileLibraryInstallErrors[row.entry.file] ? (
                                <p className="trigger-profiles-library-entry-error">
                                  {triggerProfileLibraryInstallErrors[row.entry.file]}
                                </p>
                              ) : null}
                            </div>
                            <span
                              className={`library-pill ${
                                row.entry.tier === 'verified'
                                  ? 'library-pill-verified'
                                  : 'library-pill-community'
                              }`}
                            >
                              {row.entry.tier === 'verified' ? 'Verified' : 'Community'}
                            </span>
                            {installedLibraryFiles.has(row.entry.file) ? (
                              <span className="trigger-profiles-library-installed">Installed</span>
                            ) : (
                              <button
                                type="button"
                                className="secondary-action trigger-profiles-library-install-button"
                                disabled={triggerProfileLibraryInstalling !== null}
                                onClick={() => void installTriggerProfileFromLibrary(row.entry)}
                              >
                                {triggerProfileLibraryInstalling === row.entry.file ? 'Installing…' : 'Install'}
                              </button>
                            )}
                          </li>
                        )
                      )}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showBridgeSettings && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setShowBridgeSettings(false)}
        >
          <div
            className="settings-menu bridge-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Bridge settings"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <SettingsIcon size={16} />
                <span>Bridge Settings</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close bridge settings"
                onClick={() => setShowBridgeSettings(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="bridge-settings-columns">
              <div className="bridge-settings-column">
                <div className="settings-menu-section-label">Appearance</div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Theme</strong>
                  </div>
                  <CustomSelect
                    value={snapshot.settings.uiThemePreset}
                    options={UI_THEME_OPTIONS}
                    className="settings-theme-select"
                    showSelectedCheck={false}
                    ariaLabel="UI theme"
                    disabled={pendingAction !== null}
                    renderValue={(label, value) => <ThemeOption label={label} value={value} />}
                    renderOption={(label, value) => <ThemeOption label={label} value={value} />}
                    onChange={(value) => {
                      void runAction('ui-theme', () => window.bridge.setUiThemePreset(value));
                    }}
                  />
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>UI Scale</strong>
                  </div>
                  <CustomSelect
                    value={snapshot.settings.uiScalePercent}
                    options={UI_SCALE_OPTIONS}
                    className="settings-scale-select"
                    showSelectedCheck={false}
                    ariaLabel="UI scale"
                    disabled={pendingAction !== null}
                    onChange={(value) => {
                      void runAction('ui-scale', () => window.bridge.setUiScalePercent(value));
                    }}
                  />
                </div>
                <div className="settings-menu-section-label">General</div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Launch at Startup</strong>
                    <span>Start in the tray when Windows starts</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.launchAtStartupEnabled}
                    className={`switch ${snapshot.settings.launchAtStartupEnabled ? 'on' : ''}`}
                    disabled={pendingAction !== null}
                    onClick={() => void runAction('launch-at-startup', () => (
                      window.bridge.setLaunchAtStartupEnabled(!snapshot.settings.launchAtStartupEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Battery Tray Icon</strong>
                    <span>Show controller battery percentage in the tray</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.showBatteryPercentTrayIcon}
                    className={`switch ${snapshot.settings.showBatteryPercentTrayIcon ? 'on' : ''}`}
                    disabled={pendingAction !== null}
                    onClick={() => void runAction('battery-tray-icon', () => (
                      window.bridge.setShowBatteryPercentTrayIcon(!snapshot.settings.showBatteryPercentTrayIcon)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-section-label">Connection Behavior</div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Idle Disconnect</strong>
                  </div>
                  <div className="settings-menu-controls">
                    <CustomSelect
                      value={snapshot.settings.idleDisconnectTimeoutMinutes}
                      options={IDLE_DISCONNECT_TIMEOUT_OPTIONS}
                      className="settings-timeout-select"
                      showSelectedCheck={false}
                      ariaLabel="Idle disconnect timeout"
                      disabled={!connected || !snapshot.settings.idleDisconnectEnabled}
                      onChange={(value) => {
                        void runAction('idle-timeout', () => window.bridge.setIdleDisconnectTimeoutMinutes(value));
                      }}
                    />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={snapshot.settings.idleDisconnectEnabled}
                      className={`switch ${snapshot.settings.idleDisconnectEnabled ? 'on' : ''}`}
                      disabled={!connected}
                      onClick={() => void runAction('idle', () => (
                        window.bridge.setIdleDisconnectEnabled(!snapshot.settings.idleDisconnectEnabled)
                      ))}
                    >
                      <span />
                    </button>
                  </div>
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>PC Sleep Disconnect</strong>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.usbSuspendDisconnectEnabled}
                    className={`switch ${snapshot.settings.usbSuspendDisconnectEnabled ? 'on' : ''}`}
                    disabled={!connected || !usbSuspendDisconnectSupported}
                    onClick={() => void runAction('usb-suspend', () => (
                      window.bridge.setUsbSuspendDisconnectEnabled(!snapshot.settings.usbSuspendDisconnectEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div className="bridge-settings-column">
                <div className="settings-menu-section-label">Power & Controller</div>
                <div className={`settings-menu-row ${settingsFocusTarget === 'controller-power-saving' ? 'settings-menu-row-highlight' : ''}`}>
                  <div className="settings-menu-copy">
                    <strong>Controller Power Saving</strong>
                    <span>Caps haptics, triggers, and lightbar brightness at 60% while headphones are plugged in</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.controllerPowerSavingEnabled}
                    className={`switch ${snapshot.settings.controllerPowerSavingEnabled ? 'on' : ''}`}
                    disabled={pendingAction !== null}
                    onClick={() => void runAction('controller-power-saving', () => (
                      window.bridge.setControllerPowerSavingEnabled(!snapshot.settings.controllerPowerSavingEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Touchpad Mouse Input</strong>
                    <span>Let the touchpad move the desktop cursor. Turn off to stop games treating touchpad gestures as camera movement; in-game touch features keep working</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.touchpadMouseEnabled}
                    className={`switch ${snapshot.settings.touchpadMouseEnabled ? 'on' : ''}`}
                    disabled={pendingAction !== null}
                    onClick={() => void runAction('touchpad-mouse', () => (
                      window.bridge.setTouchpadMouseEnabled(!snapshot.settings.touchpadMouseEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Player Slot LED</strong>
                    <span>Show the controller player indicator lights</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.playerLedEnabled}
                    className={`switch ${snapshot.settings.playerLedEnabled ? 'on' : ''}`}
                    disabled={!connected}
                    onClick={() => void runAction('player-led', () => (
                      window.bridge.setPlayerLedEnabled(!snapshot.settings.playerLedEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-section-label">Shortcuts</div>
                <div className={`settings-menu-row ${settingsFocusTarget === 'sleep-shortcut' ? 'settings-menu-row-highlight' : ''}`}>
                  <div className="settings-menu-copy settings-menu-copy-tooltip">
                    <strong>Sleep Shortcut</strong>
                    <div className="settings-shortcut-tooltip shortcut-glyph-tooltip" role="tooltip">
                      <span>Put controller to sleep with</span>
                      <span className="shortcut-glyph-row" aria-label="PlayStation Home and Triangle">
                        <span className="shortcut-glyph-key">
                          <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                        </span>
                        <span className="shortcut-plus" aria-hidden="true">+</span>
                        <span className="shortcut-glyph-key">
                          <img src={triangleGlyphUrl} alt="Triangle" />
                        </span>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.sleepKeybindEnabled}
                    className={`switch ${snapshot.settings.sleepKeybindEnabled ? 'on' : ''}`}
                    disabled={!connected || !sleepControllerSupported || pendingAction !== null}
                    onClick={() => void runAction('sleep-keybind', () => (
                      window.bridge.setSleepKeybindEnabled(!snapshot.settings.sleepKeybindEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className={`settings-menu-row ${settingsFocusTarget === 'volume-shortcut' ? 'settings-menu-row-highlight' : ''}`}>
                  <div className="settings-menu-copy settings-menu-copy-tooltip">
                    <strong>Volume Shortcut</strong>
                    <div className="settings-shortcut-tooltip shortcut-glyph-tooltip" role="tooltip">
                      <span>Controller volume up/down with</span>
                      <span className="shortcut-glyph-row" aria-label="PlayStation Home and D-pad Up or D-pad Down">
                        <span className="shortcut-glyph-key">
                          <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                        </span>
                        <span className="shortcut-plus" aria-hidden="true">+</span>
                        <span className="shortcut-glyph-pair">
                          <span className="shortcut-glyph-key">
                            <img src={dpadUpGlyphUrl} alt="D-pad Up" />
                          </span>
                          <span className="shortcut-glyph-key">
                            <img src={dpadDownGlyphUrl} alt="D-pad Down" />
                          </span>
                        </span>
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.speakerVolumeShortcutEnabled}
                    className={`switch ${snapshot.settings.speakerVolumeShortcutEnabled ? 'on' : ''}`}
                    disabled={!connected}
                    onClick={() => void runAction('volume-shortcut', () => (
                      window.bridge.setSpeakerVolumeShortcutEnabled(!snapshot.settings.speakerVolumeShortcutEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-section-label">About</div>
                <button
                  type="button"
                  className="settings-menu-link-row"
                  onClick={() => void window.bridge.openExternal('https://github.com/LordVicky/OpenDS5')}
                >
                  <span className="settings-menu-link-icon" aria-hidden="true">
                    <IconBrandGithub size={18} />
                  </span>
                  <span className="settings-menu-link-copy">
                    <strong>OpenDS5{appVersion ? ` ${appVersion}` : ''}</strong>
                    <span>LordVicky/OpenDS5 · AGPL-3.0</span>
                  </span>
                </button>
                {/* Upstream attribution. The companion app is an AGPL-3.0 derivative of
                    SundayMoments/DS5_Bridge, so the credit stays. */}
                <button
                  type="button"
                  className="settings-menu-link-row"
                  onClick={() => void window.bridge.openExternal('https://github.com/SundayMoments')}
                >
                  <span className="settings-menu-link-icon" aria-hidden="true">
                    <IconBrandGithub size={18} />
                  </span>
                  <span className="settings-menu-link-copy">
                    <strong>Based on DS5 Bridge</strong>
                    <span>by SundayMoments</span>
                  </span>
                </button>
                {/* vds (MIT, Jihong Min) is the virtual-DualSense transport this port runs on. */}
                <button
                  type="button"
                  className="settings-menu-link-row"
                  onClick={() => void window.bridge.openExternal('https://github.com/hurryman2212/vds')}
                >
                  <span className="settings-menu-link-icon" aria-hidden="true">
                    <IconBrandGithub size={18} />
                  </span>
                  <span className="settings-menu-link-copy">
                    <strong>Powered by vds</strong>
                    <span>by Jihong Min · MIT</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!startupTutorialOpen && !anyModalOpen && (
        <UpdateToast
          state={updateState}
          onAction={(action) => {
            if (action === 'skip') {
              if ('version' in updateState) void window.update.skip(updateState.version);
              setUpdateState({ phase: 'idle' });
              return;
            }
            if (action === 'dismiss') {
              void window.update.dismiss();
              setUpdateState({ phase: 'idle' });
              return;
            }
            void window.update[action]();
          }}
        />
      )}

    </div>
  );
}

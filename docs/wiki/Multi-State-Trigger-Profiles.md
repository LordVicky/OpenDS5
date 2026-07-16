# 🔀 Multi-State Trigger Profiles

One trigger feel per game is fine — until you swap from a pistol to a shotgun and the trigger still feels like a pistol. **States** fix that: a game profile can hold several named effect sets ("Pistol", "Shotgun", "Driving"), and **switch rules** flip between them when you press the game's own buttons. The feel follows what you're doing in-game, even though the game knows nothing about OpenDS5.

> **Availability:** states shipped after v1.8.0. If your editor has no **States** strip, update the app first — see [[Updates]].

## ✅ Before you start

| Requirement | Why |
|---|---|
| Game Trigger Profiles enabled | States live inside game profiles — see [[Game Profiles and Library]] |
| Your user in the `input` group | Switch rules read controller buttons from the input device, same as reactive modifiers. Without it the profile's default state still applies; switching just won't fire. See [[Troubleshooting and FAQ]] |
| The game does **not** have native trigger support | If the game drives the triggers itself, let it — a custom profile would fight it |

## 🚀 Quick start: a two-state shooter profile

1. Open **Game Trigger Profiles** and select (or create) the profile for your game.
2. In the editor, click **Add states**. Your current trigger setup becomes the first state (named **Default**), and a fresh empty **State 2** is added.
3. Rename them in the **State name** field — say, **Pistol** and **Shotgun**.
4. Click a state chip to edit that state's L2/R2 effects, exactly like a normal profile. Editing live-previews on your controller, so you can feel each state as you tune it.
5. Scroll to **State Switching** and click **Add Switch Rule**. Set the button to the game's weapon-swap button (often **Triangle**) and the action to **Cycle to next state**.
6. **Save.** Launch the game — every Triangle press now flips the trigger feel along with your weapon.

## 🗂️ Working with states

- **Add state** — appends a new empty state (up to 12 per profile).
- **Rename** — type in the **State name** field. Rules pointing at the state follow the rename automatically.
- **Duplicate** — copies the selected state; the natural flow for making a variant ("Shotgun" → tweak → "Sniper").
- **Remove state** — deletes the selected state and any select-rules that pointed at it. Removing down to one state turns the profile back into a plain single-feel profile.

The state you're editing is only about editing — which state is *active in-game* is decided by the switch rules and the live state chips (below).

## 🎛️ Switch rules

Each rule fires when a button is **pressed** (not while held) and changes the active state:

| Rule part | What it does |
|---|---|
| **Button** | The controller button that triggers the rule — face buttons, shoulders, sticks, D-pad, Create/Options/PS |
| **Cycle to next state** | Steps to the next state in order, wrapping at the end. Matches games where one button cycles weapons |
| **Select a state** | Jumps straight to a named state. Matches games with slot binding (D-pad slots) — and it *self-corrects*: no matter how confused tracking got, the next press lands right |
| **Chord** (optional) | A second button that must be **held** for the rule to fire — e.g. button **R1** + chord **PS** gives you a switch combo no game ever sees |

Rules are checked top to bottom; the first match for a pressed button wins.

**Prefer select over cycle where the game allows it.** Cycle rules can drift out of sync (the game refuses a swap you pressed — no ammo, animation lock, cutscene); select rules re-anchor on every press.

## 🛡️ The menu guard

Pressing Triangle three times while comparing items in an inventory would cycle your state three times — the game didn't swap anything, but the tracker counted every press. The **menu guard** prevents that:

- Set **Menu button** to whatever opens the game's menu (usually **Options**).
- While the guard is up, switch rules are ignored. Pressing the menu button again lowers it.
- **Menu timeout (s)** lowers the guard automatically after that many seconds, as a backstop for menus you closed some other way (0 = never). 30 s is a sensible starting point.

## 🎯 Default state

**Default state** is where the profile starts: on game launch, on controller reconnect, and whenever the profile re-activates. Pick the state matching how the game usually hands you control.

## 🔁 When tracking drifts: the state chips

OpenDS5 only sees your inputs, never the game — switching is an inference, and games sometimes move the goalposts (a cutscene hands you a rifle, a scripted section takes your weapons). When the feel doesn't match what's on screen:

- The page header shows **state chips** for the running profile, with the active one highlighted. Click any chip to force that state — one click, back in sync.
- Or press any **select**-rule button in-game; it re-anchors by design.

The status line always tells you where tracking thinks you are: `Active: Cyberpunk 2077 — Shotgun (matched: cyberpunk2077)`.

## 📤 Sharing multi-state profiles

States travel with the profile: **Export**/**Import** and the community library carry them like any other profile. In the JSON they look like this:

```jsonc
{
  "version": 1,
  "name": "My Shooter",
  "match": { "processNames": ["shooter.exe"], "windowTitles": [] },
  "triggers": { /* mirrors the first state, for older apps' benefit */ },
  "states": [
    { "name": "Pistol",  "triggers": { "l2": { /* … */ }, "r2": { /* … */ } } },
    { "name": "Shotgun", "triggers": { /* … */ } }
  ],
  "switching": {
    "defaultState": "Pistol",
    "rules": [
      { "button": "triangle",   "action": "cycle" },
      { "button": "dpad-right", "action": "select", "state": "Shotgun" }
    ],
    "menuButtons": ["options"],
    "menuTimeoutMs": 30000
  },
  "updatedAtMs": 0
}
```

Older app versions reject profiles that carry `states` (with an error naming the field) — share plain single-state exports with folks who haven't updated yet.

## 🔧 Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Rules never fire, but base effects work | No input-device access — add your user to the `input` group and re-log. See [[Troubleshooting and FAQ]] |
| State flips while browsing menus | Set the **Menu button** for that game, and consider a menu timeout |
| Feel is one state "behind" the game | A cycle rule drifted — click the right state chip, and swap cycle rules for select rules where the game has slot binding |
| Switching stopped after I opened a menu and left it with a different button | The guard is still up — press the menu button once, wait for the timeout, or click a state chip (chips bypass the guard) |
| Effects don't change at all in-game | Check the engine is **Running** in the page header and the right profile matched — see [[Game Profiles and Library]] |

## 🧠 Honest limits

Switching reacts to *your fingers*, not the game. It can't know a swap was blocked, a cutscene re-armed you, or a mod changed your loadout — only native game support (or a game mod feeding real state) can. Multi-state profiles are designed so being wrong is cheap: select rules and state chips put you right in one press. For everything they *can't* know, see the honest-limitations section of the [README](https://github.com/LordVicky/OpenDS5#%EF%B8%8F-honest-limitations-of-custom-trigger-profiles).

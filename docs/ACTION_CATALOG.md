# GTA San Andreas AI Companion - Action Catalog & Layered Modes

The companion AI utilizes a layered architecture where actions are partitioned into dedicated operational modes to prevent command interference.

---

## 1. Layered Modes Overview

The AI Companion operates in four distinct layers. When a player talks to the NPC, the LLM determines whether to switch the active mode or execute an action within the current mode.

| Mode | Focus | Description |
| :--- | :--- | :--- |
| `companion` (Default) | Following & Life | General following, dialogue, healing, looking around. |
| `combat` | Firearms & Defense | Weapons equipment, shootout defense, vehicle drive-by. |
| `vehicle` | Driving & Navigation | Car retrieval, cruising, driving to map target markers. |
| `emote` | Social & Fun | Dancing, smoking, drunk behavior, cheering, kisses. |

---

## 2. Mode Actions & Opcode Matrix

### 2.1 Mode: `companion`
| Action Command | Opcode / Implementation | Description | Example Voice Prompt |
| :--- | :--- | :--- | :--- |
| `follow_player` | `grp.setMember(ped)` | Returns to CJ and follows on foot or in vehicle. | "Follow me", "Come here", "Let's roll" |
| `look_at_player` | `ped.lookAtChar(playerChar, 3000)` | Turns head towards CJ to make eye contact. | "Look at me", "Listen up" |
| `face_player` | `ped.turnToFaceChar(playerChar)` | Rotates full body towards CJ. | "Face me", "Look this way" |
| `heal` | `ped.setHealth(100)` | Uses first aid to restore companion health. | "Take this medkit", "Heal yourself" |
| `attack_threat` | `Task.KillCharOnFoot(ped, threat)` | Engages nearby hostile attacking CJ. | "Take him down!", "Get him!" |
| `none` | N/A | Conversational response only, no physical action. | "What's up?", "How are you doing?" |

---

### 2.2 Mode: `combat`
| Action Command | Weapon Given | Model ID | Ammo | Description | Example Voice Prompt |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `arm_rifle` | M4 (ID 31) | 356 | 600 | Equips military assault rifle with 85% accuracy. | "Equip your M4", "Get the heavy rifle!" |
| `arm_rpg` | Rocket Launcher (ID 35) | 359 | 50 | Equips heavy anti-armor / anti-aircraft RPG launcher. | "Bring out the rockets!", "Blow them to hell!" |
| `arm_combat_shotgun` | Combat Shotgun (ID 27) | 351 | 150 | Equips tactical semi-auto SPAS-12 combat shotgun. | "Grab the combat shotgun", "Tactical breach!" |
| `arm_pistol` | Desert Eagle (ID 24) | 348 | 250 | Equips high caliber heavy handgun. | "Pull out your Deagle", "Grab the pistol" |
| `arm_smg` | MP5 (ID 29) | 353 | 500 | Equips rapid fire submachine gun. | "Take this MP5", "Pull out the SMG" |
| `arm_uzi` | Micro Uzi (ID 28) | 352 | 500 | Equips compact one-handed machine pistol. | "Equip the Uzi", "Pull out the Micro Uzi" |
| `arm_shotgun` | Shotgun (ID 25) | 349 | 100 | Equips classic pump-action shotgun. | "Grab the shotgun", "Get the 12-gauge" |
| `disarm` | Unarmed (ID 0) | - | 0 | Cleans hands, holsters weapons safely. | "Holster your gun", "Put it away" |
| `driveby` | Active Weapon | - | - | Hangs out the vehicle window firing at hostiles. | "Drive-by time!", "Hang out the window!" |
| `hands_up` | `Task.HandsUp(ped, 3000)` | - | - | Raises hands in surrender (police standoff). | "Put your hands up!", "Don't shoot!" |

---

### 2.3 Mode: `vehicle`
| Action Command | Opcode / Implementation | Description | Example Voice Prompt |
| :--- | :--- | :--- | :--- |
| `fetch_car` | 3-Phase Engine | Sprints to nearest empty car, enters, drives to CJ. | "Bring me a car", "Go find a ride" |
| `drive_wander` | `Task.CarDriveWander` | Drives around San Andreas casually while CJ chills (Speed: 22.0 or 38.0 for Driver). | "Just drive around", "Take the wheel" |
| `drive_to_target` | `Task.CarDriveToCoord` | Drives CJ directly to the yellow target map marker (Speed: 28.0 or 40.0 for Driver). | "Drive to my marker", "Take us there" |
| `exit_car` | `Task.LeaveAnyCar` | Steps out of the car safely. | "Get out of the car", "Step out" |

---

### 2.4 Mode: `emote`
| Action Command | Animation / IFP | Description | Example Voice Prompt |
| :--- | :--- | :--- | :--- |
| `dance` | `DAN_Loop_A / dnce_M_a` | Busts moves with San Andreas club dance animations. | "Dance with me!", "Show me your moves" |
| `strip` | `strip_A / STRIP` | Adult / club exotic dance routine. | "Dance for me", "Give me a private dance" |
| `lapdance` | `LAPDAN_D / LAPDAN1` | Club lap dance animation routine. | "Give me a lap dance", "Show me some love" |
| `kiss` / `flirt` | `Grlfrd_Kiss_01 / KISSING` | Romantic kiss and affectionate greeting. | "Give me a kiss", "Come here sweetheart" |
| `act_drunk` | `WALK_drunk / PED` | Stumbles around with slurred gait. | "Have a drink", "Act drunk" |
| `sober_up` | Standard Walk | Returns to normal walking animation group. | "Sober up", "Walk straight" |
| `smoke` | `M_smk_loop / F_smklean_loop` | Lights up a cigarette and puffs. | "Take a smoke", "Light one up" |
| `cheer` | `bd_clap / DANCING` | Cheers and claps for CJ with authentic dance applause. | "Celebrate!", "We did it!" |
| `cower` | `DUCK_cower / PED` | Cowering panic stance when under fire. | "Take cover!", "Duck down!" |

---

### 2.5 Persona System (`/persona`)
Specialized operational roles with dynamic in-game stat overrides:

| Persona | Key Stats & Overrides | In-Engine Autonomous Reflexes (0 API Cost) | Command Shortcut |
| :--- | :--- | :--- | :--- |
| **Hitman** | 100% Accuracy, 100 Shoot Rate, M4 & Deagle | Autonomous lethal engagement against threats, Ballas, Vagos, and police up to 65m. | `/persona hitman`, `/hitman` |
| **Field Medic** | 65% Accuracy, Deagle sidearm, Defensive | Autonomous Field Triage: heals CJ to 100 HP + 50 armor whenever CJ drops below 70 HP (18s cooldown). | `/persona medic`, `/medic` |
| **Demolitions** | Heavy RPG (ID 35), SPAS-12, 100 Armor | Anti-Air & Anti-Vehicle: Locks onto and destroys police cruisers, SWAT vans, and police helicopters with rockets (Wanted $\ge 2$). | `/persona heavy`, `/heavy` |
| **Transporter** | Evasion Speed: 35.0 - 50.0 (scales with trust), Auto-repair | Autonomous Getaway: hops in as driver if CJ enters passenger seat; auto-repairs engine health if damaged. | `/persona driver`, `/driver` |
| **Girlfriend** | Romance / Club emotes unlocked | Affectionate greetings and idle waves; cowers and screams protective warnings during shootouts. | `/persona girlfriend`, `/girlfriend` |
| **Custom** | Player-defined System Instruction | Roleplays strictly according to custom player instructions stored in SQLite. | `/persona <custom>` |

---

## 3. Autonomous World Reactions (Ambient Intelligence)

The companion doesn't just wait for orders; they automatically react to the living environment of San Andreas:

1. **Severe Vehicle Collisions**:
   - If CJ crashes the car with impact damage $\ge 50$ HP, companion screams, complains about CJ's driving, or warns him to slow down.
2. **Car Radio Station Commentary**:
   - The companion recognizes the current playing station (e.g. *Radio Los Santos*, *K-DST*, *Bounce FM*, *WCTR*) and shares trivia or opinions about the music genre.
3. **Time of Day & Sunrise/Sunset**:
   - At Dawn (5:00 - 7:00), Noon, Golden Hour (17:00 - 19:00), or Midnight (0:00 - 4:00), the companion comments on the hour and street atmosphere.
4. **Autonomous Threat Defense**:
   - If CJ is shot or hit by Ballas, Vagos, or street thugs on foot, companion draws their weapon and fires back instantly without needing a voice command.
5. **Vehicle Drive-By Shooting**:
   - When hostile vehicles or gang members shoot at CJ's car, passenger companion hangs out the window to shoot back.

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
| `arm_rifle` | M4 (ID 31) | 356 | 500 | Equips military assault rifle with 85% accuracy. | "Equip your M4", "Get the heavy rifle!" |
| `arm_pistol` | Desert Eagle (ID 24) | 348 | 150 | Equips high caliber heavy handgun. | "Pull out your Deagle", "Grab the pistol" |
| `arm_smg` | MP5 (ID 29) | 353 | 400 | Equips rapid fire submachine gun. | "Take this MP5", "Pull out the SMG" |
| `arm_shotgun` | Combat Shotgun (ID 27) | 351 | 100 | Equips tactical shotgun for close quarters. | "Grab the shotgun", "Get ready for breach" |
| `disarm` | Unarmed (ID 0) | - | 0 | Cleans hands, holsters weapons safely. | "Holster your gun", "Put it away" |
| `driveby` | Active Weapon | - | - | Hangs out the vehicle window firing at hostiles. | "Drive-by time!", "Hang out the window!" |
| `hands_up` | `Task.HandsUp(ped, 6000)` | - | - | Raises hands in surrender (police standoff). | "Put your hands up!", "Don't shoot!" |

---

### 2.3 Mode: `vehicle`
| Action Command | Opcode / Implementation | Description | Example Voice Prompt |
| :--- | :--- | :--- | :--- |
| `fetch_car` | 3-Phase Engine | Sprints to nearest empty car, enters, drives to CJ. | "Bring me a car", "Go find a ride" |
| `drive_wander` | `Task.CarDriveWander` | Drives around San Andreas casually while CJ chills. | "Just drive around", "Take the wheel" |
| `drive_to_target` | `Task.CarDriveToCoord` | Drives CJ directly to the yellow target map marker. | "Drive to my marker", "Take us there" |
| `exit_car` | `Task.LeaveAnyCar` | Steps out of the car safely. | "Get out of the car", "Step out" |

---

### 2.4 Mode: `emote`
| Action Command | Animation / IFP | Description | Example Voice Prompt |
| :--- | :--- | :--- | :--- |
| `dance` | `DANCE / DANCING` | Busts moves with San Andreas club dance animations. | "Dance with me!", "Show me your moves" |
| `flirt` | `BLOWJOB / MISC` | Flirtatious emote depending on gender & archetype. | "Give me a kiss", "Come closer" |
| `act_drunk` | `WALK_DRUNK` | Stumbles around with slurred gait. | "Have a drink", "Act drunk" |
| `sober_up` | Standard Walk | Returns to normal walking animation group. | "Sober up", "Walk straight" |
| `smoke` | `SMK_IN / GANGS` | Lights up a cigarette and puffs. | "Take a smoke", "Light one up" |
| `cheer` | `RIOT_CHANT / RIOT` | Cheers and roots for CJ with gang chants. | "Celebrate!", "We did it!" |
| `cower` | `DUCK_COWER / PED` | Cowering panic stance when under fire. | "Take cover!", "Duck down!" |

---

## 3. Autonomous World Reactions (Ambient Intelligence)

The companion doesn't just wait for orders; they automatically react to the living environment of San Andreas:

1. **Severe Vehicle Collisions**:
   - If CJ crashes the car with impact damage $> 150$, companion screams, complains about CJ's driving, or warns him to slow down.
2. **Car Radio Station Commentary**:
   - The companion recognizes the current playing station (e.g. *Radio Los Santos*, *K-DST*, *Bounce FM*, *WCTR*) and shares trivia or opinions about the music genre.
3. **Time of Day & Sunrise/Sunset**:
   - At Dawn (5:00 - 7:00), Noon, Golden Hour (17:00 - 19:00), or Midnight (0:00 - 4:00), the companion comments on the hour and street atmosphere.
4. **Autonomous Threat Defense**:
   - If CJ is shot or hit by Ballas, Vagos, or street thugs on foot, companion draws their weapon and fires back instantly without needing a voice command.
5. **Vehicle Drive-By Shooting**:
   - When hostile vehicles or gang members shoot at CJ's car, passenger companion hangs out the window to shoot back.

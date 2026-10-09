// ====================================================================
// GTA San Andreas - AI NPC System (Stage 1 + Phase 2.1 + Phase 2.2 + Phase 2.3)
// ====================================================================

log("=== AI NPC Script Starting (Phase 2.1/2.2/2.3) ===");

showTextBox("AI NPC READY~n~Press H near a ped!");

let activePed = null;
let lastPress = 0;
let lastCarCheck = 0;
let lastIpcCheck = 0;
let lastTelemetryCheck = 0;
let wasPlayerInCar = false;
let lastAckPing = 0;
let bridgeConnected = false;

let lastSayAck = 0;
let lastActionAck = 0;
let wasPttPressed = false;

// متغيرات شريط كتابة الأوامر داخل اللعبة (In-Game Text Command Bar)
let isTypingMode = false;
let typingBuffer = "";
let lastTextCmdSeq = 0;
let keyHeldStates = {};

// متغيرات نظام الشخصيات والقدرات التكتيكية (Persona & Specialized Roles System)
let currentNpcPersona = "companion";
let activeMode = "companion";
let lastMedicHealTime = 0;
let lastHeavyAlertTime = 0;
let lastAutonomousActionTime = 0;
let lastGirlfriendFlirtTime = 0;
let companionTrust = 0.5;
let companionBravery = 0.5;

function isKeyJustPressedCustom(vk) {
    try {
        let pressed = Pad.IsKeyPressed(vk);
        let wasPressed = keyHeldStates[vk] || false;
        keyHeldStates[vk] = pressed;
        return pressed && !wasPressed;
    } catch (_) {
        return false;
    }
}

function setPlayerControlSafe(playerObj, enabled) {
    try {
        if (playerObj && typeof playerObj.setControl === "function") {
            playerObj.setControl(enabled);
        }
    } catch (_) {}
}

function safeGtaString(str) {
    if (!str) return "";
    // تنظيف أي رمز تيلدا عشوائي غير مغلق وأي حروف خارج خريطة خطوط GTA SA لمنع تحطيم الـ HUD
    return String(str).replace(/~(?![rgbynwh]~)/gi, "").replace(/[_^|\\{}]/g, "");
}

function setTypingLock(playerObj, charObj, lockState) {
    try {
        if (charObj && Char.DoesExist(charObj)) {
            charObj.freezePosition(lockState);
            if (lockState) {
                charObj.clearTasksImmediately();
            }
        }
        if (playerObj) {
            setPlayerControlSafe(playerObj, !lockState);
        }
    } catch (_) {}
}

let carFetchActive = false;
let carFetchCar = null;
let carFetchStartTime = 0;
let carFetchLastDriveUpdate = 0;
let carFetchPhase = 0; // 0 = sprint to car, 1 = enter car, 2 = drive car to CJ

let lastCarHealth = 1000;
let lastCrashTime = 0;
let lastThreatCheck = 0;
let currentThreatChar = null;
let lastDriveByTime = 0;
let activePedBlip = null;
let currentBlipDisplay = -1;
let lastBlipUpdate = 0;

const INI_FILE = "cleo/ainpc_bridge.ini";

// دالة التحكم الديناميكي في علامة الرادار والمجسم ثلاثي الأبعاد
function updateCompanionBlip(playerChar, activePed) {
    if (activePedBlip === null) return;
    try {
        let desiredDisplay = 2; // الوضع الافتراضي: 2 = BLIP_ONLY (رادار فقط دون أي علامة ثلاثية الأبعاد فوق الرأس)

        let isPedInCar = activePed.isInAnyCar();
        let isPlayerInCar = playerChar.isInAnyCar();

        if (isPedInCar) {
            // إذا كان المرافق داخل سيارة
            if (isPlayerInCar) {
                let pCar = playerChar.getCarIsUsing();
                let nCar = activePed.getCarIsUsing();
                if (pCar && nCar && pCar === nCar) {
                    // كلاهما في نفس السيارة معاً -> إخفاء العلامة تماماً لمنع أي سهم فوق السيارة
                    desiredDisplay = 0; // 0 = NEITHER
                } else {
                    // في سيارة مختلفة (كإحضار سيارة) -> رادار فقط
                    desiredDisplay = 2; // 2 = BLIP_ONLY
                }
            } else {
                desiredDisplay = 2; // 2 = BLIP_ONLY
            }
        } else {
            // على الأقدام
            let cjPos = playerChar.getCoordinates();
            let pedPos = activePed.getCoordinates();
            let dist = Math.hypot(cjPos.x - pedPos.x, cjPos.y - pedPos.y, cjPos.z - pedPos.z);

            if (dist <= 25.0) {
                // قريب من CJ (أقل من 25 متراً) -> رادار فقط بدون أي سهم ثلاثي الأبعاد فوق الرأس
                desiredDisplay = 2; // 2 = BLIP_ONLY
            } else {
                // بعيد عن CJ (أكثر من 25 متراً) -> إظهار السهم فوق الرأس لتسهيل العثور عليه
                desiredDisplay = 3; // 3 = BOTH
            }
        }

        if (currentBlipDisplay !== desiredDisplay) {
            currentBlipDisplay = desiredDisplay;
            activePedBlip.changeDisplay(desiredDisplay);
        }
    } catch (_) {}
}

// دالة تزويد الـ NPC بالأسلحة مع تحميل الموديل الآمن وضبط دقة التصويب
function giveNpcWeapon(ped, weaponType, modelId, ammo) {
    try {
        if (!Streaming.HasModelLoaded(modelId)) {
            Streaming.RequestModel(modelId);
            Streaming.LoadAllModelsNow();
        }
        if (Streaming.HasModelLoaded(modelId)) {
            ped.giveWeapon(weaponType, ammo);
            ped.setCurrentWeapon(weaponType);
            ped.setAccuracy(85);
            ped.setShootRate(100);
            ped.setWeaponSkill(2);
            Streaming.MarkModelAsNoLongerNeeded(modelId);
            return true;
        } else {
            log(`[AI ERROR] Weapon model ${modelId} failed to load.`);
        }
    } catch (e) {
        log(`[AI ERROR] Failed to equip weapon ${weaponType}: ${e}`);
    }
    return false;
}

// دالة البحث المتقدم عن أقرب سيارة صالحة للاستخدام
function findClosestCar(centerX, centerY, centerZ, maxRadius, playerChar, activePed) {
    let bestCar = null;
    let bestDist = maxRadius;

    // 1. فحص حوض المركبات الشامل عبر Opcode 0AE2
    try {
        let car = World.GetRandomCarInSphereNoSaveRecursive(centerX, centerY, centerZ, maxRadius, false, true);
        while (car && Car.DoesExist(car) && !Car.IsDead(car)) {
            let pos = car.getCoordinates();
            let d = Math.hypot(centerX - pos.x, centerY - pos.y, centerZ - pos.z);
            if (d < bestDist) {
                bestDist = d;
                bestCar = car;
            }
            car = World.GetRandomCarInSphereNoSaveRecursive(centerX, centerY, centerZ, maxRadius, true, true);
        }
    } catch (_) {}

    // 2. خطة احتياطية 1: فحص أقرب كائن مركب من اللاعب عبر 0AB5 مع التحقق الصارم من صحة المقبض
    if (bestCar === null && playerChar) {
        try {
            let closest = playerChar.storeClosestEntities();
            let c = closest.carHandle;
            if (c && c.handle !== undefined && c.handle > 0 && Car.DoesExist(c) && !Car.IsDead(c)) {
                let pos = c.getCoordinates();
                let d = Math.hypot(centerX - pos.x, centerY - pos.y, centerZ - pos.z);
                if (d <= maxRadius) {
                    bestCar = c;
                    bestDist = d;
                }
            }
        } catch (_) {}
    }

    // 3. خطة احتياطية 2: فحص أقرب مركب من الـ NPC نفسه
    if (bestCar === null && activePed && Char.DoesExist(activePed)) {
        try {
            let closest = activePed.storeClosestEntities();
            let c = closest.carHandle;
            if (c && c.handle !== undefined && c.handle > 0 && Car.DoesExist(c) && !Car.IsDead(c)) {
                let pos = c.getCoordinates();
                let d = Math.hypot(centerX - pos.x, centerY - pos.y, centerZ - pos.z);
                if (d <= maxRadius) {
                    bestCar = c;
                    bestDist = d;
                }
            }
        } catch (_) {}
    }

    return { car: bestCar, dist: bestDist };
}

// فحص جنس الشخصية بشكل محلي أصيل
function isPedFemale(ped) {
    try {
        let pType = ped.getPedType();
        if (pType === 5 || pType === 22) {
            return true;
        }
    } catch (_) {}
    return false;
}

// دالة الكشف المتقدم عن مركبات وطائرات الشرطة المعادية (Hostile Police Vehicles & Helicopters)
function findNearbyHostileVehicle(centerX, centerY, centerZ, maxRadius) {
    let bestCar = null;
    let bestDist = maxRadius;
    const POLICE_MODELS = [596, 597, 598, 599, 427, 433, 432, 497, 425, 528, 490];
    try {
        let car = World.GetRandomCarInSphereNoSaveRecursive(centerX, centerY, centerZ, maxRadius, false, true);
        while (car && Car.DoesExist(car) && !Car.IsDead(car)) {
            let model = car.getModel();
            if (POLICE_MODELS.indexOf(model) !== -1) {
                let pos = car.getCoordinates();
                let d = Math.hypot(centerX - pos.x, centerY - pos.y, centerZ - pos.z);
                if (d < bestDist) {
                    bestDist = d;
                    bestCar = car;
                }
            }
            car = World.GetRandomCarInSphereNoSaveRecursive(centerX, centerY, centerZ, maxRadius, true, true);
        }
    } catch (_) {}
    return bestCar;
}

// دالة الكشف المتقدم عن التهديدات المحيطة باللاعب أو المرافق
function findNearbyThreat(playerChar, activePed, maxRadius) {
    if (!playerChar || !Char.DoesExist(playerChar)) return null;
    let pPos = playerChar.getCoordinates();
    let player = new Player(0);
    let wanted = 0;
    try {
        wanted = player.storeWantedLevel();
    } catch (_) {}

    let foundThreat = null;
    let bestDist = maxRadius;
    const RIVAL_GANGS = [102, 103, 104, 108, 109, 110];

    try {
        let ped = World.GetRandomCharInSphereNoSaveRecursive(pPos.x, pPos.y, pPos.z, maxRadius, false, 1);
        while (ped && Char.DoesExist(ped)) {
            let isDead = false;
            let hp = 0;
            try {
                isDead = Char.IsDead(ped);
                hp = ped.getHealth();
            } catch (_) {
                isDead = true;
            }

            if (!isDead && hp > 0 && ped !== playerChar && ped !== activePed) {
                let isEnemy = false;

                // 1. هل الشخص ألحق ضرراً باللاعب أو المرافق؟
                try {
                    if (playerChar.hasBeenDamagedByChar(ped) || activePed.hasBeenDamagedByChar(ped)) {
                        isEnemy = true;
                    }
                } catch (_) {}

                // 2. هل الشخص يطلق النار وقريب من اللاعب؟
                if (!isEnemy) {
                    try {
                        if (ped.isShooting()) {
                            isEnemy = true;
                        }
                    } catch (_) {}
                }

                // 3. إذا كان اللاعب مطلوباً للشرطة (Wanted Level > 0)، رجال الشرطة أعداء تلقائياً
                if (!isEnemy && wanted > 0) {
                    try {
                        let pType = ped.getPedType();
                        if (pType === 6) { // 6 = COP
                            isEnemy = true;
                        }
                    } catch (_) {}
                }

                // 4. فحص عصابات بالاس وفاغوس المعادية لشخصية القاتل/المجرم
                if (!isEnemy && currentNpcPersona === "hitman") {
                    try {
                        let m = ped.getModel();
                        if (RIVAL_GANGS.indexOf(m) !== -1) {
                            let pedPos = ped.getCoordinates();
                            let d = Math.hypot(pPos.x - pedPos.x, pPos.y - pedPos.y, pPos.z - pedPos.z);
                            if (d <= 35.0) {
                                isEnemy = true;
                            }
                        }
                    } catch (_) {}
                }

                if (isEnemy) {
                    let pedPos = ped.getCoordinates();
                    let d = Math.hypot(pPos.x - pedPos.x, pPos.y - pedPos.y, pPos.z - pedPos.z);
                    if (d < bestDist) {
                        bestDist = d;
                        foundThreat = ped;
                    }
                }
            }
            ped = World.GetRandomCharInSphereNoSaveRecursive(pPos.x, pPos.y, pPos.z, maxRadius, true, 1);
        }
    } catch (_) {}

    return foundThreat;
}

// دالة تنفيذ إطلاق النار من نافذة السيارة (Vehicle Drive-By Shooting)
function engageDriveBy(ped, target, targetCar) {
    try {
        let curWep = ped.getCurrentWeapon();
        if (curWep !== 28 && curWep !== 29 && curWep !== 32) {
            giveNpcWeapon(ped, 28, 352, 500); // Micro Uzi for drive-by
        }
        Task.DriveBy(ped, target, targetCar, 0.0, 0.0, 0.0, 60.0, 8, false, 90);
        return true;
    } catch (e) {
        log(`[AI ERROR] Drive-By failed: ${e}`);
        return false;
    }
}

// دالة تشغيل الحركات والمشاعر والتفاعلات الحركية
function playNpcAnimation(ped, animName, ifpName, loop, durationMs) {
    try {
        if (ifpName.toUpperCase() !== "PED") {
            if (!Streaming.HasAnimationLoaded(ifpName)) {
                Streaming.RequestAnimation(ifpName);
                Streaming.LoadAllModelsNow();
            }
        }
        ped.clearTasksImmediately();
        Task.PlayAnim(ped, animName, ifpName, 4.0, loop, false, false, false, durationMs);
        return true;
    } catch (e) {
        log(`[AI ERROR] Failed to play animation ${animName}: ${e}`);
    }
    return false;
}

try {
    IniFile.WriteInt(0, INI_FILE, "GAME", "npc_active");
    IniFile.WriteString("companion", INI_FILE, "GAME", "active_persona");
    IniFile.WriteString("companion", INI_FILE, "GAME", "active_mode");
} catch (_) {}

while (true) {
    wait(50);

    let player = new Player(0);
    let playerChar = player.getChar();
    let now = Date.now();

    // =========================================================
    // المرحلة 2.1: مصافحة الجسر ونبضات الاتصال (Heartbeat Handshake)
    // =========================================================
    if (now - lastIpcCheck > 250) {
        lastIpcCheck = now;
        try {
            let ping = IniFile.ReadInt(INI_FILE, "BRIDGE", "ping");
            if (ping !== undefined && ping > 0) {
                if (ping !== lastAckPing) {
                    lastAckPing = ping;
                    IniFile.WriteInt(ping, INI_FILE, "GAME", "pong");
                    IniFile.WriteString("connected", INI_FILE, "GAME", "status");

                    if (!bridgeConnected) {
                        bridgeConnected = true;
                        showTextBox("~g~AI BRIDGE LINKED!~n~~w~Python Handshake OK");
                        log(`[AI IPC] Handshake verified with Python Bridge! (Ping=${ping})`);
                    }
                }
            }

            let trustStr = IniFile.ReadString(INI_FILE, "BRIDGE", "trust_level");
            if (trustStr && trustStr.length > 0) {
                let parsedTrust = parseFloat(trustStr);
                if (!isNaN(parsedTrust)) {
                    companionTrust = Math.max(0.0, Math.min(1.0, parsedTrust));
                }
            }

            let braveryStr = IniFile.ReadString(INI_FILE, "BRIDGE", "bravery");
            if (braveryStr && braveryStr.length > 0) {
                let parsedBravery = parseFloat(braveryStr);
                if (!isNaN(parsedBravery)) {
                    companionBravery = Math.max(0.0, Math.min(1.0, parsedBravery));
                }
            }

            let bridgePersona = IniFile.ReadString(INI_FILE, "BRIDGE", "active_persona");
            if (bridgePersona && bridgePersona.length > 0 && bridgePersona !== currentNpcPersona) {
                currentNpcPersona = bridgePersona.toLowerCase().trim();
            }
        } catch (e) {
            // صامت لحماية اللعبة
        }
    }

    // =========================================================
    // المرحلة 2.3: استقبال الحوارات والترجمة والأوامر (Subtitles & Actions)
    // =========================================================
    try {
        let sayId = IniFile.ReadInt(INI_FILE, "BRIDGE", "say_id");
        if (sayId !== undefined && sayId !== lastSayAck && sayId > 0) {
            lastSayAck = sayId;
            let sayText = IniFile.ReadString(INI_FILE, "BRIDGE", "say_text");
            if (sayText && sayText.length > 0) {
                Text.PrintStringNow(safeGtaString(sayText), 4000);
                IniFile.WriteInt(sayId, INI_FILE, "GAME", "say_ack");
                log(`[AI SUBTITLE] Displayed: "${sayText}" (ID=${sayId})`);
            }
        }

        let actionId = IniFile.ReadInt(INI_FILE, "BRIDGE", "action_id");
        if (actionId !== undefined && actionId !== lastActionAck && actionId > 0) {
            lastActionAck = actionId;
            let actionCmd = IniFile.ReadString(INI_FILE, "BRIDGE", "action_cmd");
            if (activePed !== null && Char.DoesExist(activePed) && !Char.IsDead(activePed)) {
                if (actionCmd === "look_at_player") {
                    if (carFetchActive) {
                        carFetchActive = false;
                        carFetchCar = null;
                        carFetchPhase = 0;
                        activePed.clearTasksImmediately();
                        let grp = player.getGroup();
                        grp.setMember(activePed);
                    }
                    Task.LookAtChar(activePed, playerChar, 4000);
                } else if (actionCmd === "face_player") {
                    if (carFetchActive) {
                        carFetchActive = false;
                        carFetchCar = null;
                        carFetchPhase = 0;
                        activePed.clearTasksImmediately();
                        let grp = player.getGroup();
                        grp.setMember(activePed);
                    }
                    Task.TurnCharToFaceChar(activePed, playerChar);
                } else if (actionCmd === "follow_player" || actionCmd === "cancel" || actionCmd === "stop" || actionCmd === "return") {
                    try {
                        carFetchActive = false;
                        carFetchCar = null;
                        carFetchPhase = 0;
                        activePed.clearTasksImmediately();

                        let grp = player.getGroup();
                        grp.setLeader(playerChar);
                        grp.setDefaultTaskAllocator(0);
                        grp.setFollowStatus(true);
                        grp.setSeparationRange(60.0);
                        grp.setMember(activePed);

                        let cjPos = playerChar.getCoordinates();
                        Task.GoToCoordAnyMeans(activePed, cjPos.x, cjPos.y, cjPos.z, 7, 0); // Sprint (MoveState 7) to CJ!
                        Text.PrintStringNow("~g~[AI COMPANION] Coming back to you, CJ!~w~", 3000);
                        log("[AI ACTION] Cancelled task. NPC sprinting back to CJ!");
                    } catch (e) {
                        log(`[AI ERROR] Failed to return: ${e}`);
                    }
                } else if (actionCmd === "hands_up") {
                    Task.HandsUp(activePed, 3000);
                } else if (actionCmd === "heal") {
                    activePed.setHealth(100);
                    activePed.addArmor(100);
                    Text.PrintStringNow("~g~[AI CHEAT] HESOYAM: Health & Armor Restored!~w~", 3000);
                    log("[AI CHEAT] Executed HESOYAM on active NPC (Health=100, Armor=100)");
                } else if (actionCmd === "arm_pistol") {
                    if (giveNpcWeapon(activePed, 24, 348, 250)) {
                        Text.PrintStringNow("~g~[AI ARMED] Desert Eagle equipped!~w~", 3000);
                        log("[AI ACTION] NPC armed with Desert Eagle (24/348)");
                    }
                } else if (actionCmd === "arm_smg" || actionCmd === "arm_mp5") {
                    if (giveNpcWeapon(activePed, 29, 353, 500)) {
                        Text.PrintStringNow("~g~[AI ARMED] MP5 Submachine Gun equipped!~w~", 3000);
                        log("[AI ACTION] NPC armed with MP5 (29/353)");
                    }
                } else if (actionCmd === "arm_uzi") {
                    if (giveNpcWeapon(activePed, 28, 352, 500)) {
                        Text.PrintStringNow("~g~[AI ARMED] Micro Uzi equipped!~w~", 3000);
                        log("[AI ACTION] NPC armed with Micro Uzi (28/352)");
                    }
                } else if (actionCmd === "arm_combat_shotgun") {
                    if (giveNpcWeapon(activePed, 27, 351, 100)) {
                        Text.PrintStringNow("~g~[AI ARMED] Combat Shotgun equipped!~w~", 3000);
                        log("[AI ACTION] NPC armed with Combat Shotgun (27/351)");
                    }
                } else if (actionCmd === "arm_shotgun") {
                    if (giveNpcWeapon(activePed, 25, 349, 100)) {
                        Text.PrintStringNow("~g~[AI ARMED] Shotgun equipped!~w~", 3000);
                        log("[AI ACTION] NPC armed with Shotgun (25/349)");
                    }
                } else if (actionCmd === "arm_rifle" || actionCmd === "arm_weapon" || actionCmd === "arm_m4") {
                    if (giveNpcWeapon(activePed, 31, 356, 600)) {
                        Text.PrintStringNow("~g~[AI ARMED] M4 Assault Rifle equipped!~w~", 3000);
                        log("[AI ACTION] NPC armed with M4 (31/356)");
                    }
                } else if (actionCmd === "arm_ak47") {
                    if (giveNpcWeapon(activePed, 30, 355, 600)) {
                        Text.PrintStringNow("~g~[AI ARMED] AK-47 equipped!~w~", 3000);
                        log("[AI ACTION] NPC armed with AK-47 (30/355)");
                    }
                } else if (actionCmd === "arm_rpg" || actionCmd === "arm_rocket") {
                    if (giveNpcWeapon(activePed, 35, 359, 30)) {
                        Text.PrintStringNow("~r~[AI ARMED] Rocket Launcher (RPG) equipped!~w~", 3500);
                        log("[AI ACTION] NPC armed with Rocket Launcher (35/359)");
                    }
                } else if (actionCmd === "persona_hitman") {
                    try {
                        currentNpcPersona = "hitman";
                        activePed.setAccuracy(100);
                        activePed.setShootRate(100);
                        activePed.setWeaponSkill(2);
                        giveNpcWeapon(activePed, 31, 356, 800); // M4
                        giveNpcWeapon(activePed, 24, 348, 300); // Desert Eagle
                        Text.PrintStringNow("~r~[PERSONA: HITMAN]~w~ Max Accuracy (100%) & Lethal Combat Online!", 4000);
                        log("[AI PERSONA] Hitman persona active: Accuracy=100%, M4 & Deagle equipped.");
                    } catch (e) {
                        log(`[AI ERROR] Failed to set hitman persona: ${e}`);
                    }
                } else if (actionCmd === "persona_medic") {
                    try {
                        currentNpcPersona = "medic";
                        activePed.setAccuracy(65);
                        activePed.setShootRate(70);
                        giveNpcWeapon(activePed, 24, 348, 200); // Desert Eagle for defense
                        Text.PrintStringNow("~g~[PERSONA: MEDIC]~w~ Field Medic Online! Auto-Heal & Support Active.", 4000);
                        log("[AI PERSONA] Field Medic persona active: Auto-heal passive enabled.");
                    } catch (e) {
                        log(`[AI ERROR] Failed to set medic persona: ${e}`);
                    }
                } else if (actionCmd === "persona_heavy") {
                    try {
                        currentNpcPersona = "heavy";
                        activePed.setAccuracy(90);
                        activePed.addArmor(100);
                        giveNpcWeapon(activePed, 35, 359, 50);  // Rocket Launcher
                        giveNpcWeapon(activePed, 27, 351, 150); // Combat Shotgun
                        Text.PrintStringNow("~r~[PERSONA: DEMOLITIONS]~w~ Heavy Weapons (RPG & Explosives) Online!", 4000);
                        log("[AI PERSONA] Demolitions persona active: Armed with RPG & Combat Shotgun.");
                    } catch (e) {
                        log(`[AI ERROR] Failed to set heavy persona: ${e}`);
                    }
                } else if (actionCmd === "persona_driver") {
                    try {
                        currentNpcPersona = "driver";
                        Text.PrintStringNow("~b~[PERSONA: TRANSPORTER]~w~ Master Getaway Driver Ready! Speed Boosted.", 4000);
                        log("[AI PERSONA] Transporter Driver persona active: Speed & getaway boosted.");
                    } catch (e) {
                        log(`[AI ERROR] Failed to set driver persona: ${e}`);
                    }
                } else if (actionCmd === "persona_girlfriend") {
                    try {
                        currentNpcPersona = "girlfriend";
                        Text.PrintStringNow("~p~[PERSONA: GIRLFRIEND]~w~ Romantic Companion Online! Special emotes unlocked.", 4000);
                        log("[AI PERSONA] Girlfriend persona active: Special romance and club emotes unlocked.");
                    } catch (e) {
                        log(`[AI ERROR] Failed to set girlfriend persona: ${e}`);
                    }
                } else if (actionCmd === "persona_custom") {
                    try {
                        currentNpcPersona = "custom";
                        Text.PrintStringNow("~y~[PERSONA: CUSTOM]~w~ Custom Personality & Traits Active!", 4000);
                        log("[AI PERSONA] Custom persona active.");
                    } catch (e) {
                        log(`[AI ERROR] Failed to set custom persona: ${e}`);
                    }
                } else if (actionCmd === "persona_companion" || actionCmd === "persona_reset" || actionCmd === "persona_none" || actionCmd === "persona_default") {
                    try {
                        currentNpcPersona = "companion";
                        activeMode = "companion";
                        activePed.setAccuracy(65);
                        activePed.setShootRate(50);
                        let female = isPedFemale(activePed);
                        activePed.setAnimGroup(female ? "woman" : "man");
                        activePed.clearTasksImmediately();
                        let grp = player.getGroup();
                        grp.setMember(activePed);
                        Text.PrintStringNow("~g~[PERSONA: RESET]~w~ Natural Companion Active!", 3500);
                        log("[AI PERSONA] Persona reset to default companion.");
                    } catch (e) {
                        log(`[AI ERROR] Failed to reset persona: ${e}`);
                    }
                } else if (actionCmd === "disarm") {
                    try {
                        activePed.setCurrentWeapon(0);
                        Text.PrintStringNow("~y~[AI DISARMED] NPC holstered weapon~w~", 3000);
                        log("[AI ACTION] NPC holstered weapon");
                    } catch (_) {}
                } else if (actionCmd === "driveby" || actionCmd === "drive_by" || actionCmd === "shoot_window") {
                    try {
                        if (activePed.isInAnyCar()) {
                            let threat = findNearbyThreat(playerChar, activePed, 75.0);
                            if (threat) {
                                engageDriveBy(activePed, threat, null);
                                Text.PrintStringNow("~r~[AI COMBAT] Drive-By shooting engaged!~w~", 3500);
                                log("[AI ACTION] NPC executed manual Drive-By command.");
                            } else {
                                Text.PrintStringNow("~y~[AI] No hostile targets in range for Drive-By!~w~", 3000);
                            }
                        } else {
                            Text.PrintStringNow("~y~[AI] Must be inside a vehicle for Drive-By!~w~", 3000);
                        }
                    } catch (e) {
                        log(`[AI ERROR] Drive-By failed: ${e}`);
                    }
                } else if (actionCmd === "attack" || actionCmd === "attack_threat" || actionCmd === "defend") {
                    try {
                        let threat = findNearbyThreat(playerChar, activePed, 55.0);
                        if (threat) {
                            let curWep = activePed.getCurrentWeapon();
                            if (curWep === 0) {
                                giveNpcWeapon(activePed, 31, 356, 500);
                            }
                            activePed.clearTasksImmediately();
                            Task.KillCharOnFoot(activePed, threat);
                            currentThreatChar = threat;
                            Text.PrintStringNow("~r~[AI COMBAT] Engaging target!~w~", 3500);
                            log("[AI ACTION] NPC engaging hostile target on foot.");
                        } else {
                            Text.PrintStringNow("~y~[AI] No hostile threats detected nearby!~w~", 3000);
                        }
                    } catch (e) {
                        log(`[AI ERROR] Attack failed: ${e}`);
                    }
                } else if (actionCmd === "fetch_car" || actionCmd === "bring_car" || actionCmd === "jack_car") {
                    try {
                        let cjPos = playerChar.getCoordinates();
                        let found = findClosestCar(cjPos.x, cjPos.y, cjPos.z, 75.0, playerChar, activePed);
                        if (found.car && found.dist <= 75.0) {
                            let targetCar = found.car;
                            let carPos = targetCar.getCoordinates();
                            let pedPos = activePed.getCoordinates();
                            let distToCar = Math.hypot(pedPos.x - carPos.x, pedPos.y - carPos.y, pedPos.z - carPos.z);

                            carFetchActive = true;
                            carFetchCar = targetCar;
                            carFetchStartTime = now;
                            carFetchLastDriveUpdate = 0;

                            activePed.clearTasksImmediately();

                            if (distToCar > 4.5) {
                                carFetchPhase = 0; // مرحلة الركض السريع نحو السيارة (Sprint)
                                Task.GoToCoordAnyMeans(activePed, carPos.x, carPos.y, carPos.z, 7, targetCar);
                                log(`[AI ACTION] NPC SPRINTING to vehicle at distance ${distToCar.toFixed(1)}m`);
                                Text.PrintStringNow("~g~[AI ACTION] Sprinting to get that car for CJ!~w~", 3500);
                            } else {
                                carFetchPhase = 1; // مباشرة بجانب السيارة
                                Task.EnterCarAsDriver(activePed, targetCar, -1);
                                log("[AI ACTION] NPC close to vehicle. Entering as driver!");
                                Text.PrintStringNow("~g~[AI ACTION] Jacking vehicle for CJ!~w~", 3500);
                            }
                        } else {
                            carFetchActive = false;
                            carFetchCar = null;
                            carFetchPhase = 0;
                            Text.PrintStringNow("~y~[AI] No nearby vehicle found within 75m!~w~", 3500);
                            log("[AI ACTION] No vehicle found within 75m radius.");
                        }
                    } catch (e) {
                        log(`[AI ERROR] Failed to fetch car: ${e}`);
                    }
                } else if (actionCmd === "drive_wander" || actionCmd === "drive" || actionCmd === "drive_around") {
                    try {
                        if (activePed.isInAnyCar()) {
                            let curCar = activePed.getCarIsUsing();
                            if (curCar && Car.DoesExist(curCar)) {
                                let cruiseSpeed = (currentNpcPersona === "driver") ? 38.0 : 22.0;
                                Task.CarDriveWander(activePed, curCar, cruiseSpeed, 2);
                                Text.PrintStringNow(currentNpcPersona === "driver" ? "~b~[AI TRANSPORTER] High-speed getaway cruise active!~w~" : "~g~[AI CHAUFFEUR] Cruising around Los Santos!~w~", 3500);
                                log(`[AI ACTION] NPC cruising around in car (Speed: ${cruiseSpeed}).`);
                            }
                        } else {
                            Text.PrintStringNow("~y~[AI] Must be inside a vehicle to drive!~w~", 3000);
                        }
                    } catch (e) {
                        log(`[AI ERROR] Failed to drive wander: ${e}`);
                    }
                } else if (actionCmd === "drive_to_target" || actionCmd === "drive_marker" || actionCmd === "drive_waypoint") {
                    try {
                        if (activePed.isInAnyCar()) {
                            let curCar = activePed.getCarIsUsing();
                            if (curCar && Car.DoesExist(curCar)) {
                                let target = undefined;
                                try {
                                    target = World.GetTargetCoords();
                                } catch (_) {}

                                if (target && target.x !== undefined && (target.x !== 0 || target.y !== 0)) {
                                    let targetSpeed = (currentNpcPersona === "driver") ? (35.0 + companionTrust * 15.0) : (22.0 + companionTrust * 10.0);
                                    Task.CarDriveToCoord(activePed, curCar, target.x, target.y, target.z, targetSpeed, 0, 0, 2);
                                    Text.PrintStringNow(currentNpcPersona === "driver" ? "~b~[AI TRANSPORTER] High-speed pursuit to waypoint!~w~" : "~g~[AI CHAUFFEUR] En route to target waypoint!~w~", 4000);
                                    log(`[AI ACTION] Driving to waypoint at speed ${targetSpeed} (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)})`);
                                } else {
                                    Text.PrintStringNow("~y~[AI] Place a target marker on the map first!~w~", 3500);
                                }
                            }
                        } else {
                            Text.PrintStringNow("~y~[AI] Must be inside a vehicle to drive!~w~", 3000);
                        }
                    } catch (e) {
                        log(`[AI ERROR] Failed to drive to target: ${e}`);
                    }
                } else if (actionCmd === "exit_car" || actionCmd === "leave_car") {
                    try {
                        if (activePed.isInAnyCar()) {
                            Task.LeaveAnyCar(activePed);
                            Text.PrintStringNow("~y~[AI VEHICLE] Exiting vehicle...~w~", 2500);
                            log("[AI ACTION] NPC exiting vehicle.");
                        }
                    } catch (e) {
                        log(`[AI ERROR] Failed to exit car: ${e}`);
                    }
                } else if (
                    actionCmd === "dance" || actionCmd === "dance_female" || actionCmd === "dance_male" ||
                    actionCmd === "flirt" || actionCmd === "kiss" || actionCmd === "cuddle" ||
                    actionCmd === "strip" || actionCmd === "lapdance" ||
                    actionCmd === "act_drunk" || actionCmd === "drunk" || actionCmd === "drink" ||
                    actionCmd === "sober_up" || actionCmd === "sober" ||
                    actionCmd === "gang_sign" || actionCmd === "reppin" || actionCmd === "gang" ||
                    actionCmd === "smoke" || actionCmd === "cigarette" ||
                    actionCmd === "cheer" || actionCmd === "clap" || actionCmd === "hype" ||
                    actionCmd === "cower" || actionCmd === "scared" || actionCmd === "panic"
                ) {
                    activeMode = "companion";
                    try {
                        let modeVal = IniFile.ReadString(INI_FILE, "BRIDGE", "active_mode");
                        if (modeVal && modeVal.length > 0) {
                            activeMode = modeVal.toLowerCase().trim();
                        }
                    } catch (_) {}

                    if (activeMode !== "emote" && currentNpcPersona !== "girlfriend") {
                        log(`[AI GUARD] Emote "${actionCmd}" blocked: Active mode is "${activeMode}". Switch to "emote" mode first.`);
                        Text.PrintStringNow("~y~[AI GUARD] Emotes locked! Activate Emote Mode first.~w~", 3000);
                    } else if (actionCmd === "strip") {
                        try {
                            playNpcAnimation(activePed, "strip_A", "STRIP", true, 14000);
                            Text.PrintStringNow("~p~[AI EMOTE] Performing intimate dance for CJ!~w~", 3500);
                            log("[AI EMOTE] Strip dance animation (strip_A / STRIP)");
                        } catch (e) {
                            log(`[AI ERROR] Failed to play strip animation: ${e}`);
                        }
                    } else if (actionCmd === "lapdance") {
                        try {
                            playNpcAnimation(activePed, "LAPDAN_D", "LAPDAN1", true, 14000);
                            Text.PrintStringNow("~p~[AI EMOTE] Performing lap dance for CJ!~w~", 3500);
                            log("[AI EMOTE] Lap dance animation (LAPDAN_D / LAPDAN1)");
                        } catch (e) {
                            log(`[AI ERROR] Failed to play lap dance animation: ${e}`);
                        }
                    } else if (actionCmd === "dance" || actionCmd === "dance_female" || actionCmd === "dance_male") {
                    try {
                        let female = (actionCmd === "dance_female") || (actionCmd !== "dance_male" && isPedFemale(activePed));
                        if (female) {
                            playNpcAnimation(activePed, "DAN_Loop_A", "DANCING", true, 12000);
                            Text.PrintStringNow("~g~[AI EMOTE] Dancing along to the music!~w~", 3500);
                            log("[AI EMOTE] Female NPC dancing (DAN_Loop_A / DANCING)");
                        } else {
                            playNpcAnimation(activePed, "dnce_M_a", "DANCING", true, 12000);
                            Text.PrintStringNow("~g~[AI EMOTE] Busting out dance moves!~w~", 3500);
                            log("[AI EMOTE] Male NPC breakdancing (dnce_M_a / DANCING)");
                        }
                    } catch (e) {
                        log(`[AI ERROR] Failed to dance: ${e}`);
                    }
                } else if (actionCmd === "flirt" || actionCmd === "kiss") {
                    try {
                        let female = isPedFemale(activePed);
                        if (female) {
                            playNpcAnimation(activePed, "Grlfrd_Kiss_01", "KISSING", false, 4000);
                            Text.PrintStringNow("~p~[AI EMOTE] Greeting CJ with affection!~w~", 3500);
                            log("[AI EMOTE] Female NPC greeting/flirting (Grlfrd_Kiss_01 / KISSING)");
                        } else {
                            playNpcAnimation(activePed, "prtial_gngtlkA", "GANGS", false, 3500);
                            Text.PrintStringNow("~g~[AI HOMIE] That's respect, CJ!~w~", 3500);
                            log("[AI EMOTE] Male NPC street response (prtial_gngtlkA / GANGS)");
                        }
                    } catch (e) {
                        log(`[AI ERROR] Failed to flirt: ${e}`);
                    }
                } else if (actionCmd === "act_drunk" || actionCmd === "drunk" || actionCmd === "drink") {
                    try {
                        activePed.setAnimGroup("drunkman");
                        playNpcAnimation(activePed, "WALK_drunk", "PED", true, 6000);
                        Text.PrintStringNow("~y~[AI EMOTE] NPC is tipsy & stumbling! *hic*~w~", 4000);
                        log("[AI EMOTE] NPC set to drunkman walk group & stumbling.");
                    } catch (e) {
                        log(`[AI ERROR] Failed to act drunk: ${e}`);
                    }
                } else if (actionCmd === "sober_up" || actionCmd === "sober") {
                    try {
                        let female = isPedFemale(activePed);
                        activePed.setAnimGroup(female ? "woman" : "man");
                        activePed.clearTasksImmediately();
                        Text.PrintStringNow("~g~[AI EMOTE] NPC sobered up! Ready to go.~w~", 3500);
                        log("[AI EMOTE] NPC sobered up. Reset anim group.");
                    } catch (e) {
                        log(`[AI ERROR] Failed to sober up: ${e}`);
                    }
                } else if (actionCmd === "gang_sign" || actionCmd === "reppin" || actionCmd === "gang") {
                    try {
                        playNpcAnimation(activePed, "prtial_gngtlkA", "GANGS", false, 4000);
                        Text.PrintStringNow("~g~[AI EMOTE] Reppin' Grove Street!~w~", 3500);
                        log("[AI EMOTE] NPC flashing gang signs (prtial_gngtlkA / GANGS)");
                    } catch (e) {
                        log(`[AI ERROR] Failed to flash gang signs: ${e}`);
                    }
                } else if (actionCmd === "smoke" || actionCmd === "cigarette") {
                    try {
                        let female = isPedFemale(activePed);
                        let anim = female ? "F_smklean_loop" : "M_smk_loop";
                        playNpcAnimation(activePed, anim, "SMOKING", false, 6000);
                        Text.PrintStringNow("~y~[AI EMOTE] Lighting up a cigarette...~w~", 3500);
                        log(`[AI EMOTE] NPC smoking (${anim} / SMOKING)`);
                    } catch (e) {
                        log(`[AI ERROR] Failed to smoke: ${e}`);
                    }
                } else if (actionCmd === "cheer" || actionCmd === "clap" || actionCmd === "hype") {
                    try {
                        playNpcAnimation(activePed, "bd_clap", "DANCING", false, 4000);
                        Text.PrintStringNow("~g~[AI EMOTE] Cheering and clapping for CJ!~w~", 3500);
                        log("[AI EMOTE] NPC cheering (bd_clap / DANCING)");
                    } catch (e) {
                        log(`[AI ERROR] Failed to cheer: ${e}`);
                    }
                    } else if (actionCmd === "cower" || actionCmd === "scared" || actionCmd === "panic") {
                        try {
                            playNpcAnimation(activePed, "cower", "PED", false, 4000);
                            Text.PrintStringNow("~r~[AI EMOTE] Cowering in fear!~w~", 3500);
                            log("[AI EMOTE] NPC cowering in fear (cower / PED)");
                        } catch (e) {
                            log(`[AI ERROR] Failed to cower: ${e}`);
                        }
                    }
                }
            }
            IniFile.WriteInt(actionId, INI_FILE, "GAME", "action_ack");
            log(`[AI ACTION] Executed action: "${actionCmd}" (ID=${actionId})`);
        }
    } catch (e) {
        // حماية اللعبة
    }

    // =========================================================
    // المرحلة 2.5: المايكروفون الصوتي (Push-To-Talk: Key T / 84 or Key V / 86)
    // =========================================================
    try {
        if (activePed !== null && Char.DoesExist(activePed) && !Char.IsDead(activePed)) {
            let isPttPressed = !isTypingMode && (Pad.IsKeyPressed(84) || Pad.IsKeyPressed(86));
            if (isPttPressed) {
                if (!wasPttPressed) {
                    wasPttPressed = true;
                    IniFile.WriteInt(1, INI_FILE, "GAME", "ptt_active");
                    log("[AI PTT] Microphone activated (Key held).");
                }
                Text.PrintStringNow("~y~[MIC] LISTENING... Speak now~w~", 200);
            } else {
                if (wasPttPressed) {
                    wasPttPressed = false;
                    IniFile.WriteInt(0, INI_FILE, "GAME", "ptt_active");
                    Text.PrintStringNow("~g~[MIC] PROCESSING VOICE...~w~", 1500);
                    log("[AI PTT] Microphone released (Transcribing & thinking)...");
                }
            }
        } else {
            if (wasPttPressed) {
                wasPttPressed = false;
                IniFile.WriteInt(0, INI_FILE, "GAME", "ptt_active");
            }
        }
    } catch (e) {
        // حماية اللعبة
    }

    // =========================================================
    // المرحلة 2.6: شريط كتابة الأوامر داخل اللعبة (In-Game Text Command Bar: Key ` / 192 or F6 / 117)
    // =========================================================
    try {
        if (activePed !== null && Char.DoesExist(activePed) && !Char.IsDead(activePed)) {
            // فتح أو إغلاق شريط الكتابة بالضغط على زر ذ / ` (192) أو F6 (117)
            if (isKeyJustPressedCustom(192) || isKeyJustPressedCustom(117)) {
                if (!isTypingMode) {
                    isTypingMode = true;
                    typingBuffer = "";
                    setTypingLock(player, playerChar, true);
                    log("[AI CHAT] In-game typing command bar opened.");
                } else {
                    isTypingMode = false;
                    setTypingLock(player, playerChar, false);
                    Text.PrintStringNow("~r~Command Cancelled~w~", 1000);
                }
            }

            if (isTypingMode) {
                // منع أي مهام أو حركات جسدية لـ CJ أثناء الكتابة (عزل كامل)
                playerChar.clearTasksImmediately();

                // إلغاء الأمر عبر Escape (27)
                if (isKeyJustPressedCustom(27)) {
                    isTypingMode = false;
                    setTypingLock(player, playerChar, false);
                    Text.PrintStringNow("~r~Command Cancelled~w~", 1000);
                }
                // تأكيد وإرسال الأمر عبر Enter (13)
                else if (isKeyJustPressedCustom(13)) {
                    isTypingMode = false;
                    setTypingLock(player, playerChar, false);
                    let finalCmd = typingBuffer.trim();
                    if (finalCmd.length > 0) {
                        lastTextCmdSeq++;
                        IniFile.WriteString(finalCmd, INI_FILE, "GAME", "text_cmd");
                        IniFile.WriteInt(lastTextCmdSeq, INI_FILE, "GAME", "text_cmd_id");
                        Text.PrintStringNow("~y~AI:~w~ Command Sent: " + safeGtaString(finalCmd), 2000);
                        log(`[AI CHAT] Sent in-game text command #${lastTextCmdSeq}: "${finalCmd}"`);
                    }
                }
                // مسح حرف عبر Backspace (8)
                else if (isKeyJustPressedCustom(8)) {
                    if (typingBuffer.length > 0) {
                        typingBuffer = typingBuffer.slice(0, -1);
                    }
                }
                // مسافة عبر Space (32)
                else if (isKeyJustPressedCustom(32)) {
                    if (typingBuffer.length < 45) {
                        typingBuffer += " ";
                    }
                }
                // سلاش / عبر (191 أو 111)
                else if (isKeyJustPressedCustom(191) || isKeyJustPressedCustom(111)) {
                    if (typingBuffer.length < 45) {
                        typingBuffer += "/";
                    }
                }
                // نقطتان : أو فاصلة منقوطة عبر (186)
                else if (isKeyJustPressedCustom(186)) {
                    if (typingBuffer.length < 45) {
                        typingBuffer += ":";
                    }
                }
                // شرطة - عبر (189 أو 109)
                else if (isKeyJustPressedCustom(189) || isKeyJustPressedCustom(109)) {
                    if (typingBuffer.length < 45) {
                        typingBuffer += "-";
                    }
                }
                // نقطة . عبر (190 أو 110)
                else if (isKeyJustPressedCustom(190) || isKeyJustPressedCustom(110)) {
                    if (typingBuffer.length < 45) {
                        typingBuffer += ".";
                    }
                }
                else {
                    // فحص الحروف A-Z (65 إلى 90)
                    for (let vk = 65; vk <= 90; vk++) {
                        if (isKeyJustPressedCustom(vk)) {
                            if (typingBuffer.length < 45) {
                                typingBuffer += String.fromCharCode(vk).toLowerCase();
                            }
                            break;
                        }
                    }
                    // فحص الأرقام 0-9 (48 إلى 57)
                    for (let vk = 48; vk <= 57; vk++) {
                        if (isKeyJustPressedCustom(vk)) {
                            if (typingBuffer.length < 45) {
                                typingBuffer += String.fromCharCode(vk);
                            }
                            break;
                        }
                    }
                }

                // عرض الشريط الحي على شاشة اللعبة بنصوص آمنة تماماً
                if (isTypingMode) {
                    Text.PrintStringNow("~g~AI CMD:~w~ " + safeGtaString(typingBuffer) + "~n~~w~[ENTER]=Send   [ESC]=Cancel", 250);
                }
            }
        } else {
            if (isTypingMode) {
                isTypingMode = false;
                setTypingLock(player, playerChar, false);
            }
        }
    } catch (e) {
        if (isTypingMode) {
            isTypingMode = false;
            setTypingLock(player, playerChar, false);
        }
        log(`[AI CHAT ERROR] ${e}`);
    }

    // =========================================================
    // قدرات الشخصيات التكتيكية التلقائية (Persona Autonomous Passives)
    // =========================================================
    if (activePed !== null && Char.DoesExist(activePed) && !Char.IsDead(activePed)) {
        // 1. قدرة المعالج الميداني (Medic Auto-Heal Passive)
        let medicCooldown = Math.floor(25000 - companionTrust * 10000);
        if (currentNpcPersona === "medic" && (now - lastMedicHealTime > medicCooldown)) {
            try {
                let cjHp = playerChar.getHealth();
                let npcHp = activePed.getHealth();
                let cjHealThreshold = Math.floor(45 + companionTrust * 35);
                if (cjHp < cjHealThreshold || npcHp < 50) {
                    lastMedicHealTime = now;
                    playerChar.setHealth(100);
                    let armorBonus = Math.floor(25 + companionTrust * 50);
                    playerChar.addArmor(armorBonus);
                    activePed.setHealth(100);
                    Text.PrintStringNow(`~g~[MEDIC SUPPORT] First Aid applied! (Trust: ${Math.floor(companionTrust * 100)}%)~w~`, 3500);
                    log(`[AI MEDIC PASSIVE] Healed wounded player & squad with trust scaling (Armor +${armorBonus}, Trust: ${(companionTrust * 100).toFixed(0)}%).`);
                }
            } catch (_) {}
        }

        // 2. قدرة خبير المتفجرات ضد الشرطة (Heavy Demolitions Anti-Police Passive)
        if (currentNpcPersona === "heavy" && (now - lastHeavyAlertTime > 15000)) {
            try {
                let wantedLvl = player.storeWantedLevel();
                if (wantedLvl >= 3) {
                    lastHeavyAlertTime = now;
                    giveNpcWeapon(activePed, 35, 359, 20); // RPG
                    Text.PrintStringNow("~r~[DEMOLITIONS ALERT] High Wanted Level! Rocket artillery ready!~w~", 3500);
                    log("[AI HEAVY PASSIVE] Wanted level >= 3. Switched to Rocket Launcher.");
                }
            } catch (_) {}
        }

        // 3. صيانة سيارة السائق المحترف (Transporter Vehicle Auto-Maintenance)
        if (currentNpcPersona === "driver" && activePed.isInAnyCar()) {
            try {
                let dCar = activePed.getCarIsUsing();
                if (dCar && Car.DoesExist(dCar) && !Car.IsDead(dCar)) {
                    if (dCar.getHealth() < 650) {
                        dCar.setHealth(1000);
                    }
                }
            } catch (_) {}
        }
    }

    // =========================================================
    // المرحلة 2.2: تصدير التتبع والوعي بالبيئة (Live Telemetry Export)
    // =========================================================
    if (now - lastTelemetryCheck > 400) {
        lastTelemetryCheck = now;
        try {
            let cjHealth = playerChar.getHealth();
            let cjArmor = playerChar.getArmor();
            let cjWeapon = playerChar.getCurrentWeapon();
            let cjWanted = player.storeWantedLevel();
            let cjInCar = playerChar.isInAnyCar();
            let cjCarModel = 0;
            let carRadio = -1;
            let carCrashedNow = 0;
            let crashDamage = 0;

            if (cjInCar) {
                let car = playerChar.getCarIsUsing();
                if (car && Car.DoesExist(car)) {
                    cjCarModel = car.getModel();
                    try {
                        carRadio = Audio.GetRadioChannel();
                    } catch (_) {}

                    let curCarHp = car.getHealth();
                    if (lastCarHealth > 0 && curCarHp < (lastCarHealth - 35)) {
                        if (now - lastCrashTime > 3000) {
                            lastCrashTime = now;
                            carCrashedNow = 1;
                            crashDamage = lastCarHealth - curCarHp;
                            log(`[AI IMPACT] Violent collision detected! Damage: ${crashDamage} HP (Was ${lastCarHealth}, now ${curCarHp})`);
                        }
                    }
                    lastCarHealth = curCarHp;
                }
            } else {
                lastCarHealth = 1000;
            }

            let cjPos = playerChar.getCoordinates();
            let zoneName = "SAN_AND";
            try {
                zoneName = Zone.GetName(cjPos.x, cjPos.y, cjPos.z) || "SAN_AND";
            } catch (_) {}

            // الوقت والطقس في اللعبة
            let clockHour = 12;
            let clockMin = 0;
            try {
                let t = Clock.GetTimeOfDay();
                clockHour = t.hours;
                clockMin = t.minutes;
            } catch (_) {}

            let weatherId = -1;

            let threatActive = (currentThreatChar !== null && Char.DoesExist(currentThreatChar) && !Char.IsDead(currentThreatChar)) ? 1 : 0;

            IniFile.WriteInt(cjHealth, INI_FILE, "GAME", "cj_health");
            IniFile.WriteInt(cjArmor, INI_FILE, "GAME", "cj_armor");
            IniFile.WriteInt(cjWeapon, INI_FILE, "GAME", "cj_weapon");
            IniFile.WriteInt(cjWanted, INI_FILE, "GAME", "cj_wanted");
            IniFile.WriteInt(cjInCar ? 1 : 0, INI_FILE, "GAME", "cj_in_car");
            IniFile.WriteInt(cjCarModel, INI_FILE, "GAME", "cj_car_model");
            IniFile.WriteInt(carRadio, INI_FILE, "GAME", "car_radio");
            IniFile.WriteInt(carCrashedNow, INI_FILE, "GAME", "car_crashed");
            IniFile.WriteInt(crashDamage, INI_FILE, "GAME", "crash_severity");
            IniFile.WriteInt(clockHour, INI_FILE, "GAME", "clock_hour");
            IniFile.WriteInt(clockMin, INI_FILE, "GAME", "clock_min");
            IniFile.WriteInt(weatherId, INI_FILE, "GAME", "weather_id");
            IniFile.WriteInt(threatActive, INI_FILE, "GAME", "threat_active");
            IniFile.WriteString(zoneName, INI_FILE, "GAME", "cj_zone");
            IniFile.WriteFloat(parseFloat(cjPos.x.toFixed(1)), INI_FILE, "GAME", "cj_x");
            IniFile.WriteFloat(parseFloat(cjPos.y.toFixed(1)), INI_FILE, "GAME", "cj_y");
            IniFile.WriteFloat(parseFloat(cjPos.z.toFixed(1)), INI_FILE, "GAME", "cj_z");

            let hasTarget = 0;
            let targetX = 0.0;
            let targetY = 0.0;
            try {
                let t = World.GetTargetCoords();
                if (t && t.x !== undefined && (t.x !== 0 || t.y !== 0)) {
                    hasTarget = 1;
                    targetX = parseFloat(t.x.toFixed(1));
                    targetY = parseFloat(t.y.toFixed(1));
                }
            } catch (_) {}
            IniFile.WriteInt(hasTarget, INI_FILE, "GAME", "target_active");
            IniFile.WriteFloat(targetX, INI_FILE, "GAME", "target_x");
            IniFile.WriteFloat(targetY, INI_FILE, "GAME", "target_y");

            if (activePed !== null && Char.DoesExist(activePed) && !Char.IsDead(activePed)) {
                let pedHealth = activePed.getHealth();
                let pedArmor = activePed.getArmor();
                let pedModel = activePed.getModel();
                let pedInCar = activePed.isInAnyCar();
                let pedPos = activePed.getCoordinates();
                let dist = Math.hypot(cjPos.x - pedPos.x, cjPos.y - pedPos.y, cjPos.z - pedPos.z);
                let pedWeapon = 0;
                try {
                    pedWeapon = activePed.getCurrentWeapon();
                } catch (_) {}

                IniFile.WriteInt(1, INI_FILE, "GAME", "npc_active");
                IniFile.WriteInt(pedHealth, INI_FILE, "GAME", "npc_health");
                IniFile.WriteInt(pedArmor, INI_FILE, "GAME", "npc_armor");
                IniFile.WriteInt(pedModel, INI_FILE, "GAME", "npc_model");
                IniFile.WriteInt(pedInCar ? 1 : 0, INI_FILE, "GAME", "npc_in_car");
                IniFile.WriteFloat(parseFloat(dist.toFixed(1)), INI_FILE, "GAME", "npc_dist");
                IniFile.WriteInt(pedWeapon, INI_FILE, "GAME", "npc_weapon");
            } else {
                IniFile.WriteInt(0, INI_FILE, "GAME", "npc_active");
                IniFile.WriteInt(0, INI_FILE, "GAME", "npc_weapon");
            }
        } catch (e) {
            // صامت لحماية اللعبة
        }
    }

    // فحص دوري لسلامة الكائن النشط
    if (activePed !== null) {
        if (!Char.DoesExist(activePed) || Char.IsDead(activePed)) {
            log("[AI NPC] Active ped died or despawned. Resetting state & persona.");
            try {
                if (activePedBlip !== null) {
                    activePedBlip.remove();
                    activePedBlip = null;
                    currentBlipDisplay = -1;
                }
            } catch (_) {}
            activePed = null;
            currentNpcPersona = "companion";
            activeMode = "companion";
            try {
                IniFile.WriteString("companion", INI_FILE, "GAME", "active_persona");
                IniFile.WriteString("companion", INI_FILE, "GAME", "active_mode");
                IniFile.WriteInt(0, INI_FILE, "GAME", "npc_active");
            } catch (_) {}
        } else {
            // إدارة مهمة إحضار السيارة الذاتية (Autonomous Vehicle Fetching Mission)
            if (carFetchActive) {
                if (carFetchCar === null || !Car.DoesExist(carFetchCar) || Car.IsDead(carFetchCar)) {
                    carFetchActive = false;
                    carFetchCar = null;
                    carFetchPhase = 0;
                    activePed.clearTasksImmediately();
                    let grp = player.getGroup();
                    grp.setMember(activePed);
                    log("[AI VEHICLE] Car fetch aborted (vehicle lost).");
                } else {
                    let carPos = carFetchCar.getCoordinates();
                    let pedPos = activePed.getCoordinates();

                    if (carFetchPhase === 0) {
                        // مرحلة 0: الركض السريع نحو السيارة (Sprint)
                        let distToCar = Math.hypot(pedPos.x - carPos.x, pedPos.y - carPos.y, pedPos.z - carPos.z);
                        if (distToCar <= 4.5) {
                            carFetchPhase = 1;
                            activePed.clearTasksImmediately();
                            Task.EnterCarAsDriver(activePed, carFetchCar, -1);
                            log("[AI VEHICLE] Arrived at car. Entering as driver!");
                        } else {
                            if (now - carFetchLastDriveUpdate > 1200) {
                                carFetchLastDriveUpdate = now;
                                Task.GoToCoordAnyMeans(activePed, carPos.x, carPos.y, carPos.z, 7, carFetchCar);
                            }
                        }
                    } else if (carFetchPhase === 1) {
                        // مرحلة 1: الركوب وسرقة السيارة
                        if (activePed.isInCar(carFetchCar)) {
                            carFetchPhase = 2;
                            carFetchLastDriveUpdate = 0;
                            log("[AI VEHICLE] Successfully entered car. Driving to CJ!");
                        }
                    } else if (carFetchPhase === 2) {
                        // مرحلة 2: قيادة السيارة نحو CJ
                        let cjPos = playerChar.getCoordinates();
                        let distToCj = Math.hypot(cjPos.x - carPos.x, cjPos.y - carPos.y, cjPos.z - carPos.z);

                        if (distToCj > 7.0) {
                            if (now - carFetchLastDriveUpdate > 1000) {
                                carFetchLastDriveUpdate = now;
                                Task.CarDriveToCoord(activePed, carFetchCar, cjPos.x, cjPos.y, cjPos.z, 22.0, 0, 0, 2);
                                log(`[AI VEHICLE] Driving fetched car to CJ (Distance=${distToCj.toFixed(1)}m)...`);
                            }
                        } else {
                            carFetchActive = false;
                            carFetchCar = null;
                            carFetchPhase = 0;
                            Task.CarTempAction(activePed, carFetchCar, 1, 3000); // إيقاف وفرملة
                            Text.PrintStringNow("~g~[AI VEHICLE] Car delivered! Hop in, CJ!~w~", 4000);
                            log("[AI VEHICLE] Vehicle delivered right to CJ!");
                        }
                    }

                    // مهلة أمان قصوى 30 ثانية لتفادي أي تعليق
                    if (now - carFetchStartTime > 30000) {
                        carFetchActive = false;
                        carFetchCar = null;
                        carFetchPhase = 0;
                        activePed.clearTasksImmediately();
                        let grp = player.getGroup();
                        grp.setMember(activePed);
                        log("[AI VEHICLE] Car fetch timed out. Returned to group follow.");
                    }
                }
            }

            // نظام المرافقة الذكية للمركبات
            if (!carFetchActive && now - lastCarCheck > 800) {
                lastCarCheck = now;

                if (playerChar.isInAnyCar()) {
                    wasPlayerInCar = true;

                    if (!activePed.isInAnyCar() && !activePed.isGettingInToACar()) {
                        let playerCar = playerChar.getCarIsUsing();
                        if (playerCar && Car.DoesExist(playerCar)) {
                            // قدرة السائق المحترف: ركوب مقعد السائق تلقائياً إذا ركب CJ كمرافق
                            if (currentNpcPersona === "driver" && playerCar.isDriverSeatFree()) {
                                activePed.clearTasksImmediately();
                                Task.EnterCarAsDriver(activePed, playerCar, -1);
                                Text.PrintStringNow("~b~[TRANSPORTER] Taking the wheel, CJ! Sit back!~w~", 3000);
                                log("[AI DRIVER] CJ in passenger seat. Driver taking wheel autonomously!");
                            } else {
                                let maxSeats = playerCar.getMaximumNumberOfPassengers();
                                let freeSeat = -1;
                                for (let s = 0; s < maxSeats; s++) {
                                    if (playerCar.isPassengerSeatFree(s)) {
                                        freeSeat = s;
                                        break;
                                    }
                                }
                                if (freeSeat !== -1) {
                                    Task.EnterCarAsPassenger(activePed, playerCar, -1, freeSeat);
                                    log(`[AI NPC] Commanding NPC to enter vehicle in passenger seat ${freeSeat}`);
                                }
                            }
                        }
                    }
                } else {
                    if (wasPlayerInCar) {
                        wasPlayerInCar = false;
                        log("[AI NPC] Player exited vehicle. Native Group AI will disembark NPC naturally.");
                    }
                }
            }

            // =========================================================
            // المرحلة 5.2: الذكاء التكتيكي المحلي التلقائي للشخصيات (Autonomous Persona Tactics Engine - 0 API Calls)
            // =========================================================
            if (!carFetchActive && now - lastThreatCheck > 500) {
                lastThreatCheck = now;
                try {
                    // فحص فوري: إذا كان الهدف الحالي قد مات أو اختفى، نوقف إطلاق النار فوراً
                    if (currentThreatChar !== null) {
                        let threatDead = true;
                        try {
                            if (Char.DoesExist(currentThreatChar) && !Char.IsDead(currentThreatChar) && currentThreatChar.getHealth() > 0) {
                                threatDead = false;
                            }
                        } catch (_) {
                            threatDead = true;
                        }

                        if (threatDead) {
                            currentThreatChar = null;
                            try {
                                if (!playerChar.isInAnyCar() && !activePed.isInAnyCar()) {
                                    activePed.clearTasksImmediately();
                                    let grp = player.getGroup();
                                    grp.setLeader(playerChar);
                                    grp.setDefaultTaskAllocator(0);
                                    grp.setFollowStatus(true);
                                    grp.setMember(activePed);
                                }
                            } catch (_) {}
                            log("[AI COMBAT] Active threat killed or despawned. Stopped combat tasks immediately.");
                        }
                    }

                    let threatScanRadius = (currentNpcPersona === "hitman" || currentNpcPersona === "heavy") ? 65.0 : 45.0;
                    let threat = findNearbyThreat(playerChar, activePed, threatScanRadius);

                    if (threat && Char.DoesExist(threat) && !Char.IsDead(threat) && threat.getHealth() > 0) {
                        currentThreatChar = threat;

                        // 1. تكتيكات الشخصية أثناء التواجد في المركبة (In-Vehicle Persona Tactics)
                        if (playerChar.isInAnyCar() && activePed.isInAnyCar()) {
                            let playerCar = playerChar.getCarIsUsing();
                            let isDriver = (playerCar && Car.DoesExist(playerCar) && playerCar.getDriver() === activePed);

                            if (isDriver && currentNpcPersona === "driver") {
                                // السائق المحترف: الهروب السريع والتفادي التلقائي عند التعرض لهجوم
                                if (now - lastDriveByTime > 3000) {
                                    lastDriveByTime = now;
                                    let escapeSpeed = 35.0 + companionTrust * 15.0;
                                    Task.CarDriveWander(activePed, playerCar, escapeSpeed, 2);
                                    Text.PrintStringNow("~b~[TRANSPORTER] Evasive getaway maneuver initiated!~w~", 2500);
                                    log(`[AI DRIVER] Executing high-speed evasive getaway maneuver (Speed: ${escapeSpeed.toFixed(1)})!`);
                                }
                            } else if (!isDriver) {
                                // المرافق في المقعد الجانبي: إطلاق نار من النافذة (Drive-By)
                                if (now - lastDriveByTime > 2500) {
                                    lastDriveByTime = now;
                                    let threatCar = threat.isInAnyCar() ? threat.getCarIsUsing() : null;
                                    engageDriveBy(activePed, threat, threatCar);
                                    if (currentNpcPersona === "hitman") {
                                        Text.PrintStringNow("~r~[HITMAN] Lethal Drive-By headshots engaged!~w~", 2500);
                                    } else {
                                        Text.PrintStringNow("~r~[AI COMBAT] VEHICLE DRIVE-BY INITIATED!~w~", 2500);
                                    }
                                    log("[AI COMBAT] NPC hanging out window in drive-by attack!");
                                }
                            }
                        }
                        // 2. تكتيكات الشخصية التلقائية على الأقدام (On-Foot Persona Tactics)
                        else if (!playerChar.isInAnyCar() && !activePed.isInAnyCar()) {
                            // أ. خبير المتفجرات (Demolitions & Heavy): التصدي للمركبات ومروحيات الشرطة
                            if (currentNpcPersona === "heavy") {
                                let wantedLvl = player.storeWantedLevel();
                                let pedPos = activePed.getCoordinates();
                                let hostileCar = (wantedLvl >= 2) ? findNearbyHostileVehicle(pedPos.x, pedPos.y, pedPos.z, 65.0) : null;

                                if (hostileCar && now - lastDriveByTime > 3500) {
                                    lastDriveByTime = now;
                                    giveNpcWeapon(activePed, 35, 359, 30); // RPG
                                    Task.DestroyCar(activePed, hostileCar);
                                    Text.PrintStringNow("~r~[DEMOLITIONS] Targeting police vehicle/chopper with RPG!~w~", 3000);
                                    log("[AI HEAVY] Firing Rocket Launcher at hostile vehicle/aircraft!");
                                } else {
                                    let curWep = activePed.getCurrentWeapon();
                                    if (curWep !== 27 && curWep !== 35) {
                                        giveNpcWeapon(activePed, 27, 351, 150); // Combat Shotgun
                                    }
                                    if (now - lastDriveByTime > 3500) {
                                        lastDriveByTime = now;
                                        Task.KillCharOnFoot(activePed, threat);
                                        Text.PrintStringNow("~r~[DEMOLITIONS] Heavy suppressive fire engaged!~w~", 2500);
                                        log("[AI HEAVY] Combat Shotgun ground suppression active!");
                                    }
                                }
                            }
                            // ب. القاتل المحترف (Hitman): هجوم فتاك بدقة استثنائية تتأثر بالثقة
                            else if (currentNpcPersona === "hitman") {
                                let curWep = activePed.getCurrentWeapon();
                                if (curWep === 0) {
                                    giveNpcWeapon(activePed, 31, 356, 800); // M4
                                }
                                let hitmanAcc = Math.floor(80 + companionTrust * 20);
                                let hitmanRate = Math.floor(80 + companionTrust * 20);
                                activePed.setAccuracy(hitmanAcc);
                                activePed.setShootRate(hitmanRate);
                                if (now - lastDriveByTime > 3000) {
                                    lastDriveByTime = now;
                                    Task.KillCharOnFoot(activePed, threat);
                                    Text.PrintStringNow(`~r~[HITMAN] Target in sight! Eliminating hostile! (Acc: ${hitmanAcc}%)~w~`, 2500);
                                    log(`[AI HITMAN] Autonomous lethal headshot engagement! (Accuracy: ${hitmanAcc}%)`);
                                }
                            }
                            // ج. المعالج الميداني (Medic): دفاع محكم وحماية CJ
                            else if (currentNpcPersona === "medic") {
                                let curWep = activePed.getCurrentWeapon();
                                if (curWep === 0) {
                                    giveNpcWeapon(activePed, 24, 348, 200); // Desert Eagle
                                }
                                let medAcc = Math.floor(40 + companionTrust * 30);
                                activePed.setAccuracy(medAcc);
                                if (now - lastDriveByTime > 4000) {
                                    lastDriveByTime = now;
                                    Task.KillCharOnFoot(activePed, threat);
                                    Text.PrintStringNow("~g~[FIELD MEDIC] Defensive cover fire! Stay back CJ!~w~", 2500);
                                    log(`[AI MEDIC] Defensive suppressive fire to protect player (Accuracy: ${medAcc}%).`);
                                }
                            }
                            // د. الحبيبة (Girlfriend): ذعر وتفادي خلف CJ
                            else if (currentNpcPersona === "girlfriend") {
                                if (now - lastDriveByTime > 5000) {
                                    lastDriveByTime = now;
                                    Task.HandsUp(activePed, 2500);
                                    Text.PrintStringNow("~p~[GIRLFRIEND] CJ watch out! Stay safe baby!~w~", 3000);
                                    log("[AI GIRLFRIEND] Emotional protective reaction during combat.");
                                }
                            }
                            // هـ. الوضع العادي (Companion): دفاع متدرج وفق مستوى الثقة والشجاعة
                            else {
                                let curWep = activePed.getCurrentWeapon();
                                if (curWep === 0) {
                                    giveNpcWeapon(activePed, 31, 356, 500); // M4
                                }
                                let compAcc = Math.floor(40 + companionTrust * 45);
                                let compRate = Math.floor(35 + companionTrust * 45);
                                activePed.setAccuracy(compAcc);
                                activePed.setShootRate(compRate);
                                if (now - lastDriveByTime > 4000) {
                                    lastDriveByTime = now;
                                    Task.KillCharOnFoot(activePed, threat);
                                    Text.PrintStringNow(`~r~[AI COMBAT] DEFENDING CJ! (Trust: ${Math.floor(companionTrust * 100)}%)~w~`, 2500);
                                    log(`[AI COMBAT] Autonomous threat defense: engaging on foot (Accuracy: ${compAcc}%, ShootRate: ${compRate}%).`);
                                }
                            }
                        }
                    } else {
                        // زوال الخطر: تنظيف فوري لمهام إطلاق النار وإعادة التبعية لـ CJ
                        if (currentThreatChar !== null) {
                            currentThreatChar = null;
                            try {
                                if (!playerChar.isInAnyCar() && !activePed.isInAnyCar()) {
                                    activePed.clearTasksImmediately();
                                    let grp = player.getGroup();
                                    grp.setLeader(playerChar);
                                    grp.setDefaultTaskAllocator(0);
                                    grp.setFollowStatus(true);
                                    grp.setMember(activePed);
                                }
                            } catch (_) {}
                            log("[AI COMBAT] Threat eliminated or out of range. Cleared combat tasks and restored group follow.");
                        }

                        // حارس الأمان (Ghost / Ground Shooting Watchdog):
                        // إذا انتهى الخطر تماماً ولكن المرافق ما زال يعلق في وضعية إطلاق النار نحو الأرض:
                        try {
                            if (!playerChar.isInAnyCar() && !activePed.isInAnyCar() && activePed.isShooting()) {
                                activePed.clearTasksImmediately();
                                let grp = player.getGroup();
                                grp.setLeader(playerChar);
                                grp.setDefaultTaskAllocator(0);
                                grp.setFollowStatus(true);
                                grp.setMember(activePed);
                                log("[AI COMBAT WATCHDOG] Aborted ground/ghost shooting. Reset companion to group follow.");
                            }
                        } catch (_) {}
                    }
                } catch (e) {
                    // صامت لحماية اللعبة
                }
            }

            // إدارة علامة الرادار والمجسم ثلاثي الأبعاد ديناميكياً
            if (now - lastBlipUpdate > 300) {
                lastBlipUpdate = now;
                updateCompanionBlip(playerChar, activePed);
            }
        }
    }

    // فحص ضغط المفتاح H (كود 72) - يتم تجاهله تماماً أثناء فتح شريط كتابة الأوامر
    if (!isTypingMode && Pad.IsKeyPressed(72)) {
        if (now - lastPress > 800) { // منع التكرار السريع
            lastPress = now;

            if (activePed === null) {
                try {
                    let closest = playerChar.storeClosestEntities();
                    let target = closest.charHandle;

                    log(`Closest ped check: handle = ${target}`);

                    if (target && Char.DoesExist(target) && !Char.IsDead(target) && target !== playerChar) {
                        activePed = target;
                        currentNpcPersona = "companion";
                        activeMode = "companion";
                        try {
                            IniFile.WriteString("companion", INI_FILE, "GAME", "active_persona");
                            IniFile.WriteString("companion", INI_FILE, "GAME", "active_mode");
                        } catch (_) {}
                        
                        // 1. تنظيف أي مهمة سابقة للشخصية فوراً
                        activePed.clearTasksImmediately();

                        // 2. إعداد مجموعة اللاعب وتعيين CJ كقائد رسمي
                        let grp = player.getGroup();
                        grp.setLeader(playerChar);
                        grp.setDefaultTaskAllocator(0); // 0 = FollowAnyMeans (تبعية ومرافقة كاملة)
                        grp.setFollowStatus(true);      // ركوب ومغادرة المركبات مع القائد تلقائياً
                        grp.setSeparationRange(60.0);   // المدى المسموح به

                        // 3. ضم الشخصية وتأمين ولائها
                        grp.setMember(activePed);
                        player.setGroupToFollowAlways(true); // منع أمر H من إيقاف الشخصية
                        activePed.setNeverLeavesGroup(true);
                        activePed.setNeverTargeted(true);

                        // 4. إنشاء علامة الرادار الخضراء كأعضاء العصابة الرسميين
                        try {
                            if (activePedBlip !== null) {
                                activePedBlip.remove();
                                activePedBlip = null;
                            }
                            activePedBlip = Blip.AddForChar(activePed);
                            if (activePedBlip) {
                                activePedBlip.changeColor(1); // 1 = Green (Grove Street gang color)
                                activePedBlip.changeScale(2);
                                activePedBlip.setAsFriendly(true);
                                activePedBlip.changeDisplay(2); // 2 = BLIP_ONLY (رادار فقط فورياً دون أي علامة ثلاثية الأبعاد فوق الرأس)
                                currentBlipDisplay = 2;
                            }
                            log(`[AI BLIP] Green radar blip attached to ped: ${activePed}`);
                        } catch (e) {
                            log(`[AI BLIP ERROR] Failed to attach blip: ${e}`);
                        }

                        // إذا كان اللاعب داخل مركبة بالفعل لحظة التفعيل، نطلب الركوب فوراً
                        if (playerChar.isInAnyCar()) {
                            let playerCar = playerChar.getCarIsUsing();
                            if (playerCar && Car.DoesExist(playerCar)) {
                                let maxSeats = playerCar.getMaximumNumberOfPassengers();
                                for (let s = 0; s < maxSeats; s++) {
                                    if (playerCar.isPassengerSeatFree(s)) {
                                        Task.EnterCarAsPassenger(activePed, playerCar, -1, s);
                                        break;
                                    }
                                }
                            }
                        }

                        showTextBox("~g~AI BRAIN ACTIVATED!~n~~y~NPC is following CJ on foot & car!");
                        log(`[AI NPC] Activated successfully on Ped: ${activePed}`);
                    } else {
                        showTextBox("~r~NO CITIZEN NEARBY!~n~~w~Walk closer to a pedestrian.");
                    }
                } catch (e) {
                    log("[AI NPC Error]: " + e);
                    showTextBox("~r~ERROR: " + e);
                }
            } else {
                try {
                    // إلغاء التحكم وإطلاق سراح الشخصية بأمان
                    if (activePed.isInAnyCar()) {
                        Task.LeaveAnyCar(activePed);
                    }
                    activePed.removeFromGroup();
                    activePed.clearTasks();
                    try {
                        let female = isPedFemale(activePed);
                        activePed.setAnimGroup(female ? "woman" : "man");
                    } catch (_) {}
                    activePed.setNeverTargeted(false);
                    activePed.setNeverLeavesGroup(false);

                    // إزالة علامة الرادار الخضراء عند التحرير
                    try {
                        if (activePedBlip !== null) {
                            activePedBlip.remove();
                            activePedBlip = null;
                            currentBlipDisplay = -1;
                            log("[AI BLIP] Companion radar blip removed.");
                        }
                    } catch (_) {}
                    
                    // استعادة السلوك الطبيعي للمشاة
                    Task.WanderStandard(activePed);
                    
                    // إعادة ضبط تحكم المجموعة للوضع الطبيعي
                    player.setGroupToFollowAlways(false);

                    showTextBox("~y~AI BRAIN DISABLED~n~~w~NPC released safely.");
                    log("[AI NPC] Ped released safely.");
                    activePed = null;
                    currentNpcPersona = "companion";
                    activeMode = "companion";
                    try {
                        IniFile.WriteString("companion", INI_FILE, "GAME", "active_persona");
                        IniFile.WriteString("companion", INI_FILE, "GAME", "active_mode");
                        IniFile.WriteInt(0, INI_FILE, "GAME", "npc_active");
                    } catch (_) {}
                } catch (e) {
                    log("[AI NPC Release Error]: " + e);
                    try {
                        if (activePedBlip !== null) {
                            activePedBlip.remove();
                            activePedBlip = null;
                            currentBlipDisplay = -1;
                        }
                    } catch (_) {}
                    activePed = null;
                    currentNpcPersona = "companion";
                    activeMode = "companion";
                    try {
                        IniFile.WriteString("companion", INI_FILE, "GAME", "active_persona");
                        IniFile.WriteString("companion", INI_FILE, "GAME", "active_mode");
                        IniFile.WriteInt(0, INI_FILE, "GAME", "npc_active");
                    } catch (_) {}
                }
            }
        }
    }
}

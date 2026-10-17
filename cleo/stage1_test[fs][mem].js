// ====================================================================
// GTA San Andreas - AI NPC System (Stage 1 + Phase 2.1 + Phase 2.2 + Phase 2.3)
// ====================================================================

log("=== AI NPC Script Starting (Phase 2.1/2.2/2.3) ===");

showTextBox("AI NPC READY~n~Hold H (1.2s) near ped!");

let activePed = null;
let lastPress = 0;
let hKeyHoldStartTime = 0;
let hKeyTriggered = false;
let lastCarCheck = 0;
let lastIpcCheck = 0;
let lastTelemetryCheck = 0;
let wasPlayerInCar = false;
let lastAckPing = 0;
let bridgeConnected = false;
let lastPingTime = 0;

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

function getHandle(entity) {
    if (!entity) return 0;
    if (typeof entity === "number") return entity;
    if (entity.handle !== undefined) return entity.handle;
    if (typeof entity.getHandle === "function") {
        try { return entity.getHandle(); } catch (_) {}
    }
    return 0;
}

function isSameEntity(a, b) {
    if (a === b) return true;
    let ha = getHandle(a);
    let hb = getHandle(b);
    return ha !== 0 && ha === hb;
}

// ====================================================================
// REA Level 2/3 Hardware Pointers - قراءة الذاكرة المباشرة فائقة الأمان
// ====================================================================
function getPedPointer(entity) {
    let handle = getHandle(entity);
    if (!handle || typeof handle !== "number") return 0;
    try {
        let poolPtr = Memory.ReadU32(0xB74490, false);
        if (!poolPtr) return 0;
        let objectsArray = Memory.ReadU32(poolPtr, false);
        let byteMap = Memory.ReadU32(poolPtr + 4, false);
        let slot = handle >> 8;
        if (slot < 0 || slot >= 140) return 0;
        let flag = Memory.ReadU8(byteMap + slot, false);
        if (flag & 0x80) return 0; // خانة فارغة أو محذوفة في حوض المشاة
        if ((flag & 0x7F) !== (handle & 0x7F)) return 0; // مقبض منتهي الصلاحية
        return objectsArray + (slot * 0x7C4);
    } catch (_) {
        return 0;
    }
}

function getVehiclePointer(entity) {
    let handle = getHandle(entity);
    if (!handle || typeof handle !== "number") return 0;
    try {
        let poolPtr = Memory.ReadU32(0xB74494, false);
        if (!poolPtr) return 0;
        let objectsArray = Memory.ReadU32(poolPtr, false);
        let byteMap = Memory.ReadU32(poolPtr + 4, false);
        let slot = handle >> 8;
        if (slot < 0 || slot >= 110) return 0;
        let flag = Memory.ReadU8(byteMap + slot, false);
        if (flag & 0x80) return 0;
        if ((flag & 0x7F) !== (handle & 0x7F)) return 0;
        return objectsArray + (slot * 0xA18);
    } catch (_) {
        return 0;
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
            let inCar = false;
            try { inCar = charObj.isInAnyCar(); } catch (_) {}
            if (!inCar) {
                charObj.freezePosition(lockState);
                if (lockState) {
                    charObj.clearTasksImmediately();
                }
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

let diversionActive = false;
let diversionCenterX = 0.0;
let diversionCenterY = 0.0;
let diversionCenterZ = 0.0;
let diversionStartTime = 0;
let lastDiversionTargetCheck = 0;

let lastCarHealth = 1000;
let lastCrashTime = 0;
let lastThreatCheck = 0;
let currentThreatChar = null;
let lastKilledThreat = null;
let lastKilledTime = 0;
let damageLedger = {};
const DAMAGE_MEMORY_MS = 10000;
let lastKnownCjHealth = 100;
let lastKnownActivePedHealth = 100;
let lastDriveByTime = 0;
let activePedBlip = null;
let currentBlipDisplay = -1;
let lastBlipUpdate = 0;
let lastFollowCheck = 0;

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
                if (pCar && nCar && isSameEntity(pCar, nCar)) {
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

// دالة استعادة الصحة والدرع الشاملة والمحصنة عبر الذاكرة المباشرة ودوال المحرك
function restoreCharHealthAndArmour(charObj) {
    if (!charObj || !Char.DoesExist(charObj)) return;
    try {
        charObj.setHealth(100);
    } catch (_) {}
    try {
        if (typeof charObj.setArmour === "function") {
            charObj.setArmour(100);
        } else if (typeof charObj.addArmour === "function") {
            charObj.addArmour(100);
        }
    } catch (_) {}
    // كتابة ذرية مباشرة في الذاكرة الحية لضمان 100%
    try {
        let pPed = getPedPointer(charObj);
        if (pPed === 0) {
            // فحص مؤشر اللاعب المباشر CWorld::Players[0].m_pPed
            pPed = Memory.ReadU32(0x00B7CD98, false);
        }
        if (pPed !== 0) {
            Memory.WriteFloat(pPed + 0x540, 100.0, false); // m_fHealth
            Memory.WriteFloat(pPed + 0x548, 100.0, false); // m_fArmor
        }
    } catch (_) {}
}

// دالة تزويد CJ بالسلاح والعتاد من المرافق
function givePlayerWeaponFromCompanion(weaponType, modelId, ammo, weaponName) {
    try {
        let player = new Player(0);
        let playerChar = player.getChar();
        if (giveNpcWeapon(playerChar, weaponType, modelId, ammo)) {
            playerChar.setCurrentWeapon(weaponType);
            Text.PrintStringNow("~g~[GEAR TRANSFER] Companion handed CJ " + weaponName + "!~w~", 3500);
            log("[AI GEAR] Companion transferred " + weaponName + " (Type " + weaponType + ", Ammo " + ammo + ") to CJ.");
            return true;
        }
    } catch (e) {
        log("[AI ERROR] Failed to transfer " + weaponName + " to player: " + e);
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
    let foundChopper = null;
    let chopperDist = maxRadius * 1.5;
    const CHOPPER_MODELS = [497, 425]; // 497 = Police Maverick, 425 = Hunter
    const POLICE_MODELS = [596, 597, 598, 599, 427, 433, 432, 497, 425, 528, 490];
    try {
        let scanRadius = maxRadius * 1.5;
        let car = World.GetRandomCarInSphereNoSaveRecursive(centerX, centerY, centerZ, scanRadius, false, true);
        while (car && Car.DoesExist(car) && !Car.IsDead(car)) {
            let model = car.getModel();
            let pos = car.getCoordinates();
            let d = Math.hypot(centerX - pos.x, centerY - pos.y, centerZ - pos.z);
            if (CHOPPER_MODELS.indexOf(model) !== -1) {
                if (d < chopperDist) {
                    chopperDist = d;
                    foundChopper = car;
                }
            } else if (POLICE_MODELS.indexOf(model) !== -1 && d <= maxRadius) {
                if (d < bestDist) {
                    bestDist = d;
                    bestCar = car;
                }
            }
            car = World.GetRandomCarInSphereNoSaveRecursive(centerX, centerY, centerZ, scanRadius, true, true);
        }
    } catch (_) {}
    return foundChopper ? foundChopper : bestCar;
}

// فحص ما إذا كان الهدف قد هاجم اللاعب أو المرافق مؤخراً خلال نافذة الذاكرة (10 ثوانٍ) لمنع تراكم الضرر الأبدي
function isRecentAttacker(ped, now, playerChar, activePed) {
    if (!ped || !Char.DoesExist(ped)) return false;
    let handle = getHandle(ped);
    if (!handle || handle === 0) return false;

    let isDamaged = false;
    try {
        if (playerChar.hasBeenDamagedByChar(ped) || (activePed && Char.DoesExist(activePed) && activePed.hasBeenDamagedByChar(ped))) {
            isDamaged = true;
        }
    } catch (_) {}

    if (!isDamaged) return false;

    // أول مرة يتم فيها رصد الضرر من هذا المعتدي
    if (!damageLedger[handle]) {
        damageLedger[handle] = now;
        return true;
    }

    // فحص ما إذا كان هناك ضرر جديد تعرض له اللاعب أو المرافق لتجديد النافذة
    try {
        let curCjHp = playerChar.getHealth();
        let curPedHp = (activePed && Char.DoesExist(activePed)) ? activePed.getHealth() : 100;
        if (curCjHp < lastKnownCjHealth || curPedHp < lastKnownActivePedHealth) {
            damageLedger[handle] = now;
        }
    } catch (_) {}

    // صلاحية نافذة الرد التكتيكي خلال 10 ثوانٍ فقط من آخر ضرر فعلي
    return (now - damageLedger[handle] < DAMAGE_MEMORY_MS);
}

// دالة الكشف المتقدم عن التهديدات المحيطة باللاعب أو المرافق
function findNearbyThreat(playerChar, activePed, maxRadius) {
    if (!playerChar || !Char.DoesExist(playerChar)) return null;
    let now = Date.now();

    // تنظيف مؤقت الهدف الميت الأخير بعد انقضاء 5 ثوانٍ
    if (lastKilledThreat && now - lastKilledTime > 5000) {
        lastKilledThreat = null;
    }

    // تنظيف دوري للذاكرة المؤقتة للأضرار
    if (Math.random() < 0.05) {
        for (let k in damageLedger) {
            if (now - damageLedger[k] > 30000) {
                delete damageLedger[k];
            }
        }
    }

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

            // التأكد من أن الشخص حي وصحته > 5 وأنه ليس اللاعب ولا المرافق ولا الهدف الميت مسبقاً
            if (!isDead && hp > 5 && !isSameEntity(ped, playerChar) && !isSameEntity(ped, activePed) && !isSameEntity(ped, lastKilledThreat)) {
                let pedPos = ped.getCoordinates();
                let d = Math.hypot(pPos.x - pedPos.x, pPos.y - pedPos.y, pPos.z - pedPos.z);
                let isEnemy = false;

                // 1. هل الشخص ألحق ضرراً حديثاً باللاعب أو المرافق خلال نافذة 10 ثوانٍ؟
                if (isRecentAttacker(ped, now, playerChar, activePed)) {
                    isEnemy = true;
                }

                // 2. هل الشخص يطلق النار وقريب من اللاعب (مسافة خطيرة <= 30 متراً)؟
                if (!isEnemy && d <= 30.0) {
                    try {
                        if (ped.isShooting()) {
                            isEnemy = true;
                        }
                    } catch (_) {}
                }

                // 3. الشرطة: لا نشتبك تلقائياً إلا إذا كان المطلوب 2 نجوم فأكثر أو كان المرافق قتالياً
                if (!isEnemy && wanted >= 2) {
                    try {
                        let pType = ped.getPedType();
                        if (pType === 6) { // 6 = COP
                            if (currentNpcPersona === "hitman" || currentNpcPersona === "heavy" || wanted >= 2) {
                                isEnemy = true;
                            }
                        }
                    } catch (_) {}
                }

                // 4. فحص عصابات بالاس وفاغوس المعادية لشخصية القاتل/المجرم
                if (!isEnemy && (currentNpcPersona === "hitman" || currentNpcPersona === "heavy")) {
                    try {
                        let m = ped.getModel();
                        if (RIVAL_GANGS.indexOf(m) !== -1 && d <= 35.0) {
                            isEnemy = true;
                        }
                    } catch (_) {}
                }

                if (isEnemy && d < bestDist) {
                    bestDist = d;
                    foundThreat = ped;
                }
            }
            ped = World.GetRandomCharInSphereNoSaveRecursive(pPos.x, pPos.y, pPos.z, maxRadius, true, 1);
        }
    } catch (_) {}

    // تحديث سجل صحة اللاعب والمرافق لضمان دقة نافذة الردع
    try {
        lastKnownCjHealth = playerChar.getHealth();
        if (activePed && Char.DoesExist(activePed)) {
            lastKnownActivePedHealth = activePed.getHealth();
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

// ====================================================================
// النواة الأولى: معالج ومحلل الأوامر الأوفلاين (Native Offline Engine AI Router)
// يعمل محلياً 100% داخل محرك اللعبة بدون إنترنت وبدون أي مفاتيح API وبزمن استجابة 0.0ms
// ====================================================================
function processLocalOfflineCommand(rawCmd, player, playerChar, ped) {
    if (!rawCmd || rawCmd.length === 0) return false;
    let cmd = rawCmd.toLowerCase().trim();
    if (cmd.startsWith("/")) cmd = cmd.substring(1).trim();

    let now = Date.now();

    // 1. الأوضاع والشخصيات التخصصية (Personas)
    if (cmd === "driver" || cmd === "transporter" || cmd === "chauffeur") {
        currentNpcPersona = "driver";
        giveNpcWeapon(ped, 24, 348, 150); // Desert Eagle
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~b~[OFFLINE: DRIVER] Getaway Chauffeur Active! Ready to drive.~w~", 3500);
        log("[OFFLINE AI] Activated Driver persona.");
        return true;
    } else if (cmd === "heavy" || cmd === "demolitions" || cmd === "artillery") {
        currentNpcPersona = "heavy";
        ped.addArmor(100);
        giveNpcWeapon(ped, 35, 359, 30);  // RPG
        giveNpcWeapon(ped, 27, 351, 150); // Combat Shotgun
        ped.setCurrentWeapon(35);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~r~[OFFLINE: HEAVY] Demolitions & Anti-Air Online! Armed with RPG.~w~", 3500);
        log("[OFFLINE AI] Activated Heavy persona.");
        return true;
    } else if (cmd === "hitman" || cmd === "assassin") {
        currentNpcPersona = "hitman";
        ped.setAccuracy(100);
        ped.setShootRate(100);
        ped.setWeaponSkill(2);
        giveNpcWeapon(ped, 31, 356, 800); // M4
        giveNpcWeapon(ped, 24, 348, 300); // Desert Eagle
        ped.setCurrentWeapon(31);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~r~[OFFLINE: HITMAN] Lethal Hitman Active! 100% Accuracy & M4 equipped.~w~", 3500);
        log("[OFFLINE AI] Activated Hitman persona.");
        return true;
    } else if (cmd === "medic" || cmd === "doctor") {
        currentNpcPersona = "medic";
        giveNpcWeapon(ped, 24, 348, 200);
        ped.setCurrentWeapon(24);
        restoreCharHealthAndArmour(playerChar);
        restoreCharHealthAndArmour(ped);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~g~[OFFLINE: MEDIC] Field Medic Ready! Auto-triage enabled.~w~", 3500);
        log("[OFFLINE AI] Activated Medic persona.");
        return true;
    } else if (cmd === "companion" || cmd === "reset" || cmd === "default" || cmd === "normal") {
        currentNpcPersona = "companion";
        activeMode = "companion";
        diversionActive = false;
        carFetchActive = false;
        ped.clearTasksImmediately();
        let grp = player.getGroup();
        grp.setLeader(playerChar);
        grp.setFollowStatus(true);
        grp.setSeparationRange(150.0);
        grp.setMember(ped);
        giveNpcWeapon(ped, 24, 348, 150);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~g~[OFFLINE: RESET] Default Companion Active.~w~", 3000);
        log("[OFFLINE AI] Reset to default companion.");
        return true;
    }

    // 2. أوامر الملاحة والقيادة (Vehicle & Navigation)
    else if (cmd === "drive" || cmd === "go" || cmd === "target" || cmd === "waypoint" || cmd === "drive_to_target") {
        if (ped.isInAnyCar()) {
            let curCar = ped.getCarIsUsing();
            if (curCar && Car.DoesExist(curCar)) {
                let target = undefined;
                try { target = World.GetTargetCoords(); } catch (_) {}
                if (target && target.x !== undefined && (target.x !== 0 || target.y !== 0)) {
                    let driveSpeed = (currentNpcPersona === "driver") ? 42.0 : 28.0;
                    // نمط القيادة 2 = Avoid Cars (مراوغة الازدحام وتفادي الاصطدامات)
                    Task.CarDriveToCoord(ped, curCar, target.x, target.y, target.z, driveSpeed, 0, 0, 2);
                    Text.PrintStringNow("~b~[CHAUFFEUR] En route to target waypoint! (Speed: " + driveSpeed.toFixed(0) + ")~w~", 4000);
                    log("[OFFLINE AI] Driving to waypoint: (" + target.x.toFixed(1) + ", " + target.y.toFixed(1) + ")");
                } else {
                    let cruiseSpeed = (currentNpcPersona === "driver") ? 35.0 : 22.0;
                    Task.CarDriveWander(ped, curCar, cruiseSpeed, 2);
                    Text.PrintStringNow("~y~[CHAUFFEUR] No map target set! Cruising around city...~w~", 3500);
                    log("[OFFLINE AI] No waypoint set. Wandering around.");
                }
            }
        } else {
            Text.PrintStringNow("~y~[AI] Must be inside a car to drive! Use /bring first.~w~", 3000);
        }
        return true;
    } else if (cmd === "bring" || cmd === "car" || cmd === "bring_car" || cmd === "fetch_car" || cmd === "jack") {
        let cjPos = playerChar.getCoordinates();
        let found = findClosestCar(cjPos.x, cjPos.y, cjPos.z, 75.0, playerChar, ped);
        if (found.car && found.dist <= 75.0) {
            carFetchActive = true;
            carFetchCar = found.car;
            carFetchStartTime = now;
            carFetchLastDriveUpdate = 0;
            carFetchPhase = 0;
            ped.clearTasksImmediately();
            let carPos = found.car.getCoordinates();
            Task.GoToCoordAnyMeans(ped, carPos.x, carPos.y, carPos.z, 7, found.car);
            Text.PrintStringNow("~g~[OFFLINE: VEHICLE] Sprinting to get that car for CJ!~w~", 3500);
            log("[OFFLINE AI] Car fetch initiated locally.");
        } else {
            Text.PrintStringNow("~y~[AI] No vehicle found within 75m!~w~", 3000);
        }
        return true;
    } else if (cmd === "exit" || cmd === "leave" || cmd === "leave_car") {
        if (ped.isInAnyCar()) {
            Task.LeaveAnyCar(ped);
            Text.PrintStringNow("~y~[AI] Exiting vehicle...~w~", 2500);
        }
        return true;
    }

    // 3. مهمة التشتيت وصنع الفوضى التكتيكية (Diversion / Chaos Mode)
    else if (cmd === "distract" || cmd === "chaos" || cmd === "rampage" || cmd === "diversion" || cmd === "cover") {
        diversionActive = true;
        let pPos = ped.getCoordinates();
        diversionCenterX = pPos.x;
        diversionCenterY = pPos.y;
        diversionCenterZ = pPos.z;
        diversionStartTime = now;
        lastDiversionTargetCheck = 0;

        // فك الارتباط من المجموعة ليتحرك ويقاتل بحرية دون مطاردة CJ
        ped.removeFromGroup();
        ped.clearTasksImmediately();

        // تسليح ناري ملائم لمهمة التشتيت
        let curWep = ped.getCurrentWeapon();
        if (curWep === 0) {
            giveNpcWeapon(ped, 31, 356, 800); // M4
        }
        ped.setAccuracy(90);
        ped.setShootRate(100);

        let threat = findNearbyThreat(playerChar, ped, 50.0);
        if (threat) {
            Task.KillCharOnFoot(ped, threat);
        }

        Text.PrintStringNow("~r~[DIVERSION ENGAGED] Holding off hostiles! Fall back, CJ!~w~", 4000);
        log("[OFFLINE AI] Diversion mode activated! Companion detached to cover CJ.");
        return true;
    } else if (cmd === "regroup" || cmd === "come" || cmd === "follow" || cmd === "cancel" || cmd === "stop") {
        diversionActive = false;
        carFetchActive = false;
        ped.clearTasksImmediately();
        let grp = player.getGroup();
        grp.setLeader(playerChar);
        grp.setFollowStatus(true);
        grp.setSeparationRange(150.0);
        grp.setMember(ped);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~g~[REGROUP] Coming back to you, CJ!~w~", 3000);
        log("[OFFLINE AI] Regroup command executed. Sprinting back to CJ.");
        return true;
    }

    // 4. الدعم، الصحة، ومشاركة العتاد (Health & Gear Sharing)
    else if (cmd === "heal" || cmd === "hesoyam" || cmd === "medkit" || cmd === "cure") {
        restoreCharHealthAndArmour(playerChar);
        restoreCharHealthAndArmour(ped);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~g~[OFFLINE HEALTH] 100% Health & Armor Restored!~w~", 3500);
        log("[OFFLINE AI] Full Health & Armor restored to player and companion.");
        return true;
    } else if (cmd === "gun" || cmd === "m4" || cmd === "rifle" || cmd === "weapon") {
        givePlayerWeaponFromCompanion(31, 356, 500, "M4 Assault Rifle");
        giveNpcWeapon(ped, 31, 356, 500);
        ped.setCurrentWeapon(31);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~g~[GEAR] Both CJ & Companion armed with M4!~w~", 3500);
        return true;
    } else if (cmd === "pistol" || cmd === "deagle") {
        givePlayerWeaponFromCompanion(24, 348, 200, "Desert Eagle");
        giveNpcWeapon(ped, 24, 348, 200);
        ped.setCurrentWeapon(24);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~g~[GEAR] Both CJ & Companion armed with Desert Eagle!~w~", 3500);
        return true;
    } else if (cmd === "smg" || cmd === "mp5") {
        givePlayerWeaponFromCompanion(29, 353, 400, "MP5 SMG");
        giveNpcWeapon(ped, 29, 353, 400);
        ped.setCurrentWeapon(29);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~g~[GEAR] Both CJ & Companion armed with MP5!~w~", 3500);
        return true;
    } else if (cmd === "shotgun" || cmd === "spas") {
        givePlayerWeaponFromCompanion(27, 351, 80, "Combat Shotgun");
        giveNpcWeapon(ped, 27, 351, 80);
        ped.setCurrentWeapon(27);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~g~[GEAR] Both CJ & Companion armed with SPAS-12!~w~", 3500);
        return true;
    } else if (cmd === "rpg" || cmd === "rocket") {
        givePlayerWeaponFromCompanion(35, 359, 20, "Rocket Launcher");
        giveNpcWeapon(ped, 35, 359, 20);
        ped.setCurrentWeapon(35);
        let cjPos = playerChar.getCoordinates();
        Task.GoToCoordAnyMeans(ped, cjPos.x, cjPos.y, cjPos.z, 7, 0);
        Text.PrintStringNow("~g~[GEAR] Both CJ & Companion armed with Rocket Launcher!~w~", 3500);
        return true;
    } else if (cmd === "ammo") {
        let curWep = playerChar.getCurrentWeapon();
        if (curWep > 0) {
            playerChar.giveWeapon(curWep, 300);
            Text.PrintStringNow("~g~[GEAR TRANSFER] Supplied 300 rounds of ammo!~w~", 3500);
        } else {
            givePlayerWeaponFromCompanion(31, 356, 300, "M4 Rifle with Ammo");
        }
        return true;
    }

    // 5. المشاعر والحركات (Emotes)
    else if (cmd === "dance") {
        let female = isPedFemale(ped);
        playNpcAnimation(ped, female ? "DAN_Loop_A" : "dnce_M_a", "DANCING", true, 12000);
        Text.PrintStringNow("~g~[OFFLINE EMOTE] Dancing along to the music!~w~", 3500);
        return true;
    } else if (cmd === "smoke") {
        let female = isPedFemale(ped);
        playNpcAnimation(ped, female ? "F_smklean_loop" : "M_smk_loop", "SMOKING", false, 6000);
        Text.PrintStringNow("~y~[OFFLINE EMOTE] Lighting up a cigarette...~w~", 3500);
        return true;
    } else if (cmd === "cheer" || cmd === "clap") {
        playNpcAnimation(ped, "bd_clap", "DANCING", false, 4000);
        Text.PrintStringNow("~g~[OFFLINE EMOTE] Cheering for CJ!~w~", 3500);
        return true;
    } else if (cmd === "drunk") {
        playNpcAnimation(ped, "WALK_drunk", "PED", true, 12000);
        Text.PrintStringNow("~p~[OFFLINE EMOTE] Stumbling around drunk!~w~", 3500);
        return true;
    }

    // 6. قائمة المساعدة (Help)
    else if (cmd === "help" || cmd === "commands" || cmd === "?") {
        Text.PrintStringNow("~g~COMMANDS:~w~ /driver /heavy /hitman /medic /drive /bring /distract /heal /gun", 5000);
        return true;
    }

    return false;
}

try {
    IniFile.WriteInt(0, INI_FILE, "GAME", "npc_active");
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
                    lastPingTime = now;
                    IniFile.WriteInt(ping, INI_FILE, "GAME", "pong");
                    IniFile.WriteString("connected", INI_FILE, "GAME", "status");

                    if (!bridgeConnected) {
                        bridgeConnected = true;
                        showTextBox("~g~AI BRIDGE LINKED!~n~~w~Python Handshake OK");
                        log(`[AI IPC] Handshake verified with Python Bridge! (Ping=${ping})`);
                    }
                }
            }

            // مراقبة نبضات الجسر: إذا توقفت بايثون لأكثر من 4 ثوانٍ يتحول الموديل تلقائياً لأوفلاين نظيف 100%
            if (bridgeConnected && (now - lastPingTime > 4000)) {
                bridgeConnected = false;
                log("[AI IPC] Python Bridge heartbeat lost. Operating in 100% Native Offline AI Mode.");
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

            if (bridgeConnected) {
                let bridgePersona = IniFile.ReadString(INI_FILE, "BRIDGE", "active_persona");
                if (bridgePersona && bridgePersona.length > 0 && bridgePersona !== currentNpcPersona) {
                    currentNpcPersona = bridgePersona.toLowerCase().trim();
                }
            }
        } catch (e) {
            // صامت لحماية اللعبة
        }
    }

    // =========================================================
    // المرحلة 2.3: استقبال الحوارات والترجمة والأوامر (Subtitles & Actions - Only when Bridge Linked)
    // =========================================================
    if (bridgeConnected) {
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
                        grp.setFollowStatus(true);
                        grp.setSeparationRange(150.0);
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
                    restoreCharHealthAndArmour(playerChar);
                    restoreCharHealthAndArmour(activePed);
                    Text.PrintStringNow("~g~[AI HEALTH] Health & Armor Restored for CJ & Companion!~w~", 3500);
                    log("[AI HEALTH] Restored 100% Health & Armor to CJ and active NPC.");
                } else if (actionCmd === "give_cj_weapon" || actionCmd === "arm_cj_rifle" || actionCmd === "give_cj_m4") {
                    if (givePlayerWeaponFromCompanion(31, 356, 500, "M4 Assault Rifle")) {
                        try { playNpcAnimation(activePed, "prtial_gngtlkA", "GANGS", false, 1500); } catch (_) {}
                    }
                } else if (actionCmd === "arm_cj_pistol" || actionCmd === "give_cj_pistol") {
                    if (givePlayerWeaponFromCompanion(24, 348, 200, "Desert Eagle")) {
                        try { playNpcAnimation(activePed, "prtial_gngtlkA", "GANGS", false, 1500); } catch (_) {}
                    }
                } else if (actionCmd === "arm_cj_smg" || actionCmd === "give_cj_smg" || actionCmd === "arm_cj_mp5") {
                    if (givePlayerWeaponFromCompanion(29, 353, 400, "MP5 SMG")) {
                        try { playNpcAnimation(activePed, "prtial_gngtlkA", "GANGS", false, 1500); } catch (_) {}
                    }
                } else if (actionCmd === "arm_cj_shotgun" || actionCmd === "give_cj_shotgun") {
                    if (givePlayerWeaponFromCompanion(27, 351, 80, "Combat Shotgun")) {
                        try { playNpcAnimation(activePed, "prtial_gngtlkA", "GANGS", false, 1500); } catch (_) {}
                    }
                } else if (actionCmd === "arm_cj_rpg" || actionCmd === "give_cj_rpg") {
                    if (givePlayerWeaponFromCompanion(35, 359, 20, "Rocket Launcher")) {
                        try { playNpcAnimation(activePed, "prtial_gngtlkA", "GANGS", false, 1500); } catch (_) {}
                    }
                } else if (actionCmd === "give_cj_ammo" || actionCmd === "share_ammo") {
                    try {
                        let curWep = playerChar.getCurrentWeapon();
                        if (curWep > 0) {
                            playerChar.giveWeapon(curWep, 300);
                            Text.PrintStringNow("~g~[GEAR TRANSFER] Companion supplied 300 rounds of ammo!~w~", 3500);
                            log("[AI GEAR] Supplied 300 ammo for weapon " + curWep + " to player.");
                            try { playNpcAnimation(activePed, "prtial_gngtlkA", "GANGS", false, 1500); } catch (_) {}
                        } else {
                            givePlayerWeaponFromCompanion(31, 356, 300, "M4 Rifle with Ammo");
                        }
                    } catch (e) {
                        log("[AI ERROR] Failed to give ammo: " + e);
                    }
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
                } else if (actionCmd === "flirt" || actionCmd === "kiss" || actionCmd === "cuddle") {
                    try {
                        let female = isPedFemale(activePed);
                        if (female) {
                            playNpcAnimation(activePed, "Grlfrd_Kiss_01", "KISSING", false, 4000);
                            Text.PrintStringNow("~p~[AI EMOTE] Greeting CJ with affection!~w~", 3500);
                            log("[AI EMOTE] Female NPC romance/cuddle (Grlfrd_Kiss_01 / KISSING)");
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
                        playNpcAnimation(activePed, "DUCK_cower", "PED", false, 4000);
                        Text.PrintStringNow("~r~[AI EMOTE] Cowering in fear!~w~", 3500);
                        log("[AI EMOTE] NPC cowering in fear (DUCK_cower / PED)");
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
                // منع أي مهام أو حركات جسدية لـ CJ على الأقدام أثناء الكتابة (عزل كامل دون طرد اللاعب من السيارة)
                try {
                    if (!playerChar.isInAnyCar()) {
                        playerChar.clearTasksImmediately();
                    }
                } catch (_) {}

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
                        
                        // معالجة الأمر محلياً 100% داخل محرك اللعبة (Native In-Engine Offline AI)
                        let handledOffline = processLocalOfflineCommand(finalCmd, player, playerChar, activePed);
                        if (!handledOffline) {
                            Text.PrintStringNow("~y~AI:~w~ Command Sent: " + safeGtaString(finalCmd), 2000);
                        }
                        log(`[AI CHAT] In-game text command #${lastTextCmdSeq}: "${finalCmd}" (HandledOffline=${handledOffline})`);
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
                    restoreCharHealthAndArmour(playerChar);
                    restoreCharHealthAndArmour(activePed);
                    Text.PrintStringNow(`~g~[MEDIC SUPPORT] First Aid applied! (Trust: ${Math.floor(companionTrust * 100)}%)~w~`, 3500);
                    log(`[AI MEDIC PASSIVE] Healed wounded player & squad with 100% health & armor (Trust: ${(companionTrust * 100).toFixed(0)}%).`);
                }
            } catch (_) {}
        }

        // 2. قدرة خبير المتفجرات ضد الشرطة والمروحيات (Heavy Demolitions Anti-Police & Anti-Air Passive)
        if (currentNpcPersona === "heavy" && (now - lastHeavyAlertTime > 12000)) {
            try {
                let wantedLvl = player.storeWantedLevel();
                if (wantedLvl >= 3) {
                    lastHeavyAlertTime = now;
                    activePed.setArmour(100);
                    giveNpcWeapon(activePed, 35, 359, 20); // RPG
                    let pedPos = activePed.getCoordinates();
                    let hostileTarget = findNearbyHostileVehicle(pedPos.x, pedPos.y, pedPos.z, 80.0);
                    if (hostileTarget && Car.DoesExist(hostileTarget) && !Car.IsDead(hostileTarget)) {
                        Task.DestroyCar(activePed, hostileTarget);
                        let m = hostileTarget.getModel();
                        if (m === 497 || m === 425) {
                            Text.PrintStringNow("~r~[ANTI-AIR DEFENSE] Police helicopter targeted with RPG!~w~", 3500);
                        } else {
                            Text.PrintStringNow("~r~[HEAVY DEFENSE] Police vehicle targeted with RPG!~w~", 3500);
                        }
                        log(`[AI HEAVY PASSIVE] Auto-targeting hostile police unit (model ${m}) with RPG.`);
                    } else {
                        Text.PrintStringNow("~r~[DEMOLITIONS ALERT] High Wanted Level! Rocket artillery ready!~w~", 3500);
                        log("[AI HEAVY PASSIVE] Wanted level >= 3. Switched to Rocket Launcher & full armor.");
                    }
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

            let carSpeed = 0.0;
            if (cjInCar) {
                let car = playerChar.getCarIsUsing();
                if (car && Car.DoesExist(car)) {
                    cjCarModel = car.getModel();
                    try {
                        carRadio = Audio.GetRadioChannel();
                    } catch (_) {}
                    try {
                        carSpeed = car.getSpeed();
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
            try {
                weatherId = Memory.ReadI16(0xC81320, false);
            } catch (_) {}

            let onMission = 0;
            try {
                onMission = Memory.ReadU8(0xA49FC4, false);
            } catch (_) {}

            let threatActive = (currentThreatChar !== null && Char.DoesExist(currentThreatChar) && !Char.IsDead(currentThreatChar)) ? 1 : 0;

            let hasTarget = 0;
            let targetXStr = "0.0";
            let targetYStr = "0.0";
            try {
                let t = World.GetTargetCoords();
                if (t && t.x !== undefined && (t.x !== 0 || t.y !== 0)) {
                    hasTarget = 1;
                    targetXStr = t.x.toFixed(1);
                    targetYStr = t.y.toFixed(1);
                }
            } catch (_) {}

            let npcActive = 0;
            let pedHealth = 0;
            let pedArmor = 0;
            let pedModel = 0;
            let pedInCar = 0;
            let distStr = "0.0";
            let pedWeapon = 0;
            let pedState = 1;
            let threatCount = 0;
            let npcHasTarget = 0;
            let npcIsTalking = 0;
            let npcVehHp = 0;
            let npcVehLock = 1;

            if (activePed !== null && Char.DoesExist(activePed) && !Char.IsDead(activePed)) {
                npcActive = 1;
                try { pedHealth = activePed.getHealth(); } catch (_) {}
                try { pedArmor = activePed.getArmor(); } catch (_) {}
                try { pedModel = activePed.getModel(); } catch (_) {}
                try { pedInCar = activePed.isInAnyCar() ? 1 : 0; } catch (_) {}
                try {
                    let pedPos = activePed.getCoordinates();
                    let d = Math.hypot(cjPos.x - pedPos.x, cjPos.y - pedPos.y, cjPos.z - pedPos.z);
                    distStr = d.toFixed(1);
                } catch (_) {}
                try {
                    pedWeapon = activePed.getCurrentWeapon();
                } catch (_) {}

                // =========================================================
                // قراءة الوعي التكتيكي المباشر من الذاكرة الحية عبر مؤشرات REA
                // =========================================================
                try {
                    let pPed = getPedPointer(activePed);
                    if (pPed !== 0) {
                        // 1. حالة الشخصية الأساسية (PedState: 1=IDLE, 3=ATTACK, 4=FIGHT, 9=FLEE, 14=DRIVE)
                        pedState = Memory.ReadU32(pPed + 0x530, false);

                        // 2. الهدف المعادي المباشر الذي تصوب عليه الشخصية
                        let pTarget = Memory.ReadU32(pPed + 0x784, false);
                        npcHasTarget = (pTarget !== 0) ? 1 : 0;

                        // 3. طابور مدركات الأحداث المحيطة (CEventGroup - طلقات نار، انفجارات)
                        let pIntel = Memory.ReadU32(pPed + 0x47C, false);
                        if (pIntel !== 0) {
                            threatCount = Memory.ReadU32(pIntel + 0x70, false);
                        }

                        // 4. حالة الكلام الصوتي المباشر داخل اللعبة (CPedAudio)
                        let speechId = Memory.ReadU32(pPed + 0x1D8, false);
                        npcIsTalking = (speechId !== 0) ? 1 : 0;

                        // 5. حالة ورابط المركبة وصحتها
                        let pVeh = Memory.ReadU32(pPed + 0x58C, false);
                        if (pVeh !== 0) {
                            npcVehHp = Math.round(Memory.ReadFloat(pVeh + 0x4C0, false));
                            npcVehLock = Memory.ReadI32(pVeh + 0x4F8, false);
                        }
                    }
                } catch (_) {}
            }

            let cjXStr = (cjPos && typeof cjPos.x === 'number') ? cjPos.x.toFixed(1) : "0.0";
            let cjYStr = (cjPos && typeof cjPos.y === 'number') ? cjPos.y.toFixed(1) : "0.0";
            let cjZStr = (cjPos && typeof cjPos.z === 'number') ? cjPos.z.toFixed(1) : "0.0";
            let speedStr = (typeof carSpeed === 'number' && !isNaN(carSpeed)) ? carSpeed.toFixed(1) : "0.0";

            // تجميع التيليميتري الموحدة والموسعة في حزمة ذرية واحدة
            let telemetryPacket = [
                cjHealth,
                cjArmor,
                cjWeapon,
                cjWanted,
                cjInCar ? 1 : 0,
                cjCarModel,
                speedStr,
                carRadio,
                carCrashedNow,
                crashDamage,
                clockHour,
                clockMin,
                weatherId,
                onMission,
                threatActive,
                zoneName,
                cjXStr,
                cjYStr,
                cjZStr,
                hasTarget,
                targetXStr,
                targetYStr,
                npcActive,
                pedHealth,
                pedArmor,
                pedModel,
                pedInCar,
                distStr,
                pedWeapon,
                pedState,
                threatCount,
                npcHasTarget,
                npcIsTalking,
                npcVehHp,
                npcVehLock
            ].join("|");

            IniFile.WriteString(telemetryPacket, INI_FILE, "GAME", "telemetry");
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

            // إدارة مهمة التشتيت وصنع الفوضى التكتيكية (Autonomous Diversion & Chaos Watchdog)
            if (diversionActive) {
                let cjPos = playerChar.getCoordinates();
                let pedPos = activePed.getCoordinates();
                let distToCj = Math.hypot(cjPos.x - pedPos.x, cjPos.y - pedPos.y, cjPos.z - pedPos.z);

                // شروط انتهاء مهمة التمويه: ابتعاد CJ لأكثر من 140 متراً بنجاح أو مرور 45 ثانية
                if (distToCj > 140.0 || (now - diversionStartTime > 45000)) {
                    diversionActive = false;
                    activePed.clearTasksImmediately();
                    let grp = player.getGroup();
                    grp.setLeader(playerChar);
                    grp.setFollowStatus(true);
                    grp.setSeparationRange(150.0);
                    grp.setMember(activePed);
                    Task.GoToCoordAnyMeans(activePed, cjPos.x, cjPos.y, cjPos.z, 7, 0);
                    Text.PrintStringNow("~g~[DIVERSION COMPLETE] CJ escaped safely! Squad regrouping!~w~", 4000);
                    log(`[OFFLINE DIVERSION] Finished: Dist=${distToCj.toFixed(1)}m, Time=${((now - diversionStartTime) / 1000).toFixed(1)}s. Regrouping.`);
                } else {
                    // المرافق يطلق النار على أي عدو أو شرطة في محيط 55 متراً
                    if (now - lastDiversionTargetCheck > 1800) {
                        lastDiversionTargetCheck = now;
                        let threat = findNearbyThreat(playerChar, activePed, 55.0);
                        if (threat && Char.DoesExist(threat) && !Char.IsDead(threat)) {
                            Task.KillCharOnFoot(activePed, threat);
                            log("[OFFLINE DIVERSION] Engaging hostile target during chaos cover fire.");
                        }
                    }
                }
            }

            // نظام الركوب كراكب مع السائق المحترف ومنع طرد المرافق (Smart Chauffeur & Anti-Hijack)
            if (!carFetchActive && !diversionActive && activePed.isInAnyCar() && !playerChar.isInAnyCar()) {
                let compCar = activePed.getCarIsUsing();
                if (compCar && Car.DoesExist(compCar) && !Car.IsDead(compCar)) {
                    let driver = compCar.getDriver();
                    if (driver && isSameEntity(driver, activePed)) {
                        let cjPos = playerChar.getCoordinates();
                        let carPos = compCar.getCoordinates();
                        let distToCar = Math.hypot(cjPos.x - carPos.x, cjPos.y - carPos.y, cjPos.z - carPos.z);

                        if (distToCar <= 6.0) {
                            Text.PrintStringNow("~b~[CHAUFFEUR READY] Press [F] or [G] to ride as Passenger!~w~", 200);

                            let isGPressed = !isTypingMode && isKeyJustPressedCustom(71); // Key G = 71
                            let isTryingToJack = playerChar.isGettingInToACar();

                            if (isGPressed || isTryingToJack) {
                                let maxSeats = compCar.getMaximumNumberOfPassengers();
                                let freeSeat = -1;
                                for (let s = 0; s < maxSeats; s++) {
                                    if (compCar.isPassengerSeatFree(s)) {
                                        freeSeat = s;
                                        break;
                                    }
                                }

                                if (freeSeat !== -1) {
                                    playerChar.clearTasksImmediately();
                                    Task.EnterCarAsPassenger(playerChar, compCar, -1, freeSeat);
                                    Text.PrintStringNow("~b~[CHAUFFEUR] Riding with your companion driver!~w~", 3000);
                                    log(`[AI VEHICLE] Intercepted CJ car-jack! Redirected CJ to passenger seat ${freeSeat}.`);
                                }
                            }
                        }
                    }
                }
            }

            // نظام المرافقة الذكية للمركبات
            if (!carFetchActive && !diversionActive && now - lastCarCheck > 800) {
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
            // محرك المرافقة التكتيكية النشطة على الأقدام (Active Foot Escort & Follow Engine)
            // =========================================================
            if (!carFetchActive && !diversionActive && currentThreatChar === null && !playerChar.isInAnyCar() && !activePed.isInAnyCar()) {
                if (now - lastFollowCheck > 600) {
                    lastFollowCheck = now;
                    try {
                        let cjPos = playerChar.getCoordinates();
                        let pedPos = activePed.getCoordinates();
                        let distToCj = Math.hypot(cjPos.x - pedPos.x, cjPos.y - pedPos.y, cjPos.z - pedPos.z);

                        if (distToCj > 35.0) {
                            Task.GoToCoordAnyMeans(activePed, cjPos.x, cjPos.y, cjPos.z, 7, 0);
                        } else if (distToCj > 8.0) {
                            Task.GoToCoordAnyMeans(activePed, cjPos.x, cjPos.y, cjPos.z, 6, 0);
                        } else if (distToCj > 3.2) {
                            Task.GoToCoordAnyMeans(activePed, cjPos.x, cjPos.y, cjPos.z, 4, 0);
                        } else {
                            try {
                                if (activePed.isWalking() || activePed.isRunning()) {
                                    activePed.clearTasks();
                                    Task.TurnCharToFaceChar(activePed, playerChar);
                                }
                            } catch (_) {}
                        }
                    } catch (_) {}
                }
            }

            // =========================================================
            // المرحلة 5.2: الذكاء التكتيكي المحلي التلقائي للشخصيات (Autonomous Persona Tactics Engine - 0 API Calls)
            // =========================================================
            if (!carFetchActive && !diversionActive && now - lastThreatCheck > 500) {
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
                            lastKilledThreat = currentThreatChar;
                            lastKilledTime = now;
                            currentThreatChar = null;
                            try {
                                activePed.clearTasksImmediately();
                                if (!playerChar.isInAnyCar() && !activePed.isInAnyCar()) {
                                    let grp = player.getGroup();
                                    grp.setLeader(playerChar);
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
                            let isDriver = (playerCar && Car.DoesExist(playerCar) && isSameEntity(playerCar.getDriver(), activePed));

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
                            lastKilledThreat = currentThreatChar;
                            lastKilledTime = now;
                            currentThreatChar = null;
                            try {
                                activePed.clearTasksImmediately();
                                if (!playerChar.isInAnyCar() && !activePed.isInAnyCar()) {
                                    let grp = player.getGroup();
                                    grp.setLeader(playerChar);
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

    // ====================================================================
    // المرحلة 6: التفعيل والتحرير بالمفتاح H بضغطة مطولة (Hold for 1.2s)
    // لحماية اللاعب من فقدان المرافق عند كتابة كود HESOYAM أو الضغط السريع
    // ====================================================================
    let isHPressed = !isTypingMode && Pad.IsKeyPressed(72);
    if (isHPressed) {
        if (hKeyHoldStartTime === 0) {
            hKeyHoldStartTime = now;
            hKeyTriggered = false;
        }
        let holdDuration = now - hKeyHoldStartTime;

        // إظهار تنبيه مرئي حي للاعب أثناء الاستمرار بالضغط
        if (!hKeyTriggered && holdDuration > 250) {
            let pct = Math.min(100, Math.floor((holdDuration / 1200) * 100));
            if (activePed === null) {
                Text.PrintStringNow(`~g~Holding [H] to Recruit Companion... (${pct}%)~w~`, 200);
            } else {
                Text.PrintStringNow(`~r~Holding [H] to Dismiss Companion... (${pct}%)~w~`, 200);
            }
        }

        // تفريغ الإجراء فقط بعد اكتمال 1.2 ثانية كاملة
        if (!hKeyTriggered && holdDuration >= 1200) {
            hKeyTriggered = true;
            lastPress = now;

            if (activePed === null) {
                try {
                    let closest = playerChar.storeClosestEntities();
                    let target = closest.charHandle;

                    log(`Closest ped check: handle = ${target}`);

                    if (target && Char.DoesExist(target) && !Char.IsDead(target) && !isSameEntity(target, playerChar)) {
                        activePed = target;
                        currentNpcPersona = "companion";
                        activeMode = "companion";
                        try {
                            IniFile.WriteInt(1, INI_FILE, "GAME", "npc_active");
                        } catch (_) {}
                        
                        // 1. تنظيف أي مهمة سابقة للشخصية فوراً
                        activePed.clearTasksImmediately();

                        // 2. إعداد مجموعة اللاعب وتعيين CJ كقائد رسمي
                        let grp = player.getGroup();
                        grp.setLeader(playerChar);
                        grp.setFollowStatus(true);       // ركوب ومغادرة المركبات مع القائد تلقائياً
                        grp.setSeparationRange(150.0);    // مدى واسع وتغطية كاملة

                        // 3. ضم الشخصية وتأمين ولائها
                        grp.setMember(activePed);
                        player.setGroupToFollowAlways(true); // منع أمر H من إيقاف الشخصية
                        activePed.setNeverLeavesGroup(true);
                        activePed.setNeverTargeted(true);

                        // 4. تسليح المرافق فوراً بمسدس تكتيكي للدفاع عن النفس واستدعاؤه نحو CJ
                        giveNpcWeapon(activePed, 24, 348, 150);
                        let cjPos = playerChar.getCoordinates();
                        Task.GoToCoordAnyMeans(activePed, cjPos.x, cjPos.y, cjPos.z, 7, 0);

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
                        IniFile.WriteInt(0, INI_FILE, "GAME", "npc_active");
                    } catch (_) {}
                }
            }
        }
    } else {
        hKeyHoldStartTime = 0;
        hKeyTriggered = false;
    }
}


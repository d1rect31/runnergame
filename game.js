// --- Настройка холста (Canvas) ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1280;
canvas.height = 720;

// --- Стили и Переменные ---
const GAME_FONT = '24px "Verdana", sans-serif'; 
let gameSpeed = 2;
let score = 0;
let gameFrame = 0; 
const gravity = 0.15; 

// НОВЫЕ: Таймеры для нормализованного спауна
let platformSpawnTimer = 0;
let birdSpawnTimer = 0;
let cloudSpawnAccumulator = 0; 

let lastTime = 0; 
const TARGET_FPS = 60;
const TIME_STEP = 500 / TARGET_FPS; // 16.67ms - целевое время кадра

// НОВОЕ: Аудио плеер
const BGM = new Audio('SEGA.mp3'); 
BGM.loop = true; 
BGM.volume = 0.1;

let sfxVolumeMultiplier = 0.5;
// НОВОЕ: Звуковые эффекты (SFX) 🎧
const sfx = {
    jump: new Audio('jump.wav'),
    death: new Audio('hitHurt.wav'),
    coin: new Audio('pickupCoin.wav'),
    chest: new Audio('chest.mp3')
};
sfx.jump.volume = 0.5 * sfxVolumeMultiplier;
sfx.death.volume = 0.6 * sfxVolumeMultiplier;
sfx.coin.volume = 0.4 * sfxVolumeMultiplier;
sfx.chest.volume = 0.7 * sfxVolumeMultiplier;

// НОВОЕ: Настройки Ускорения Скорости
const BASE_GAME_SPEED = 2; 
const SPEED_INCREASE_THRESHOLD = 50; 
const SPEED_INCREASE_AMOUNT = 0.2; 

// --- Настройки Высоты Платформ ---
const GROUND_PLATFORM_MIN_THICKNESS = 50; 
const GROUND_PLATFORM_MAX_THICKNESS = 200; 
const AIR_PLATFORM_MIN_Y = 200;           
const AIR_PLATFORM_MAX_Y = 500;           

// --- Настройки Высоты Птиц ---
const BIRD_MIN_Y = 100; 
const BIRD_MAX_Y = 500; 

// --- Настройки Спауна ---
const SHOOT_COOLDOWN_FRAMES = 15;
const PLATFORM_SPAWN_INTERVAL = 100;

const CHANCE_OF_GAP = 0.10;
const CHANCE_OF_AIR_PLATFORM = 0.60;

const SPAWN_CHANCE_SLIME = 0.12;
const SPAWN_CHANCE_MUSHROOM = 0.12;
const SPAWN_CHANCE_COIN = 0.26;
const SPAWN_CHANCE_CHEST = 0.10;
const BIRD_SPAWN_INTERVAL = 1000;


// --- Состояние игры и Рекорды ---
let gameState = 'menu'; 
let highScore = localStorage.getItem('runnerHighScore') || 0;
const startButton = {
    x: canvas.width / 2 - 100,
    y: canvas.height / 2 + 10,
    width: 200,
    height: 50
};

// --- Управление ---
const keys = {
    ArrowRight: false,
    ArrowLeft: false,
    ArrowUp: false,
    ArrowDown: false, 
    KeyW: false,
    KeyA: false,
    KeyS: false, 
    KeyD: false,
    Space: false
};

// Слушатель клавиатуры
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (gameState === 'playing') {
            gameState = 'paused';
            BGM.pause(); 
        } else if (gameState === 'paused') {
            gameState = 'playing';
            BGM.play().catch(error => {}); 
        }
    }
    
    if (gameState === 'playing') {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = true;
        } else if (e.key === ' ') { 
             keys.Space = true;
        }
    } else if (gameState === 'gameOver' && e.key === 'Enter') {
        gameState = 'menu';
    } else if (gameState === 'menu' && e.key === 'Enter') { 
        init(); 
    }
});
window.addEventListener('keyup', (e) => {
    if (gameState === 'playing') {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = false;
        } else if (e.key === ' ') {
             keys.Space = false;
        }
    }
});

// Слушатель кликов мыши
canvas.addEventListener('click', (e) => {
    if (gameState !== 'menu') return; 

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (mouseX > startButton.x &&
        mouseX < startButton.x + startButton.width &&
        mouseY > startButton.y &&
        mouseY < startButton.y + startButton.height)
    {
        init(); 
    }
});

// --- Вспомогательная функция для рисования скругленных прямоугольников ---
function drawRoundedRect(x, y, w, h, radius) {
    if (w < 2 * radius) radius = w / 2;
    if (h < 2 * radius) radius = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    ctx.fill();
}


// --- Класс Облаков ---
class Cloud {
    constructor(y) {
        this.width = Math.random() * 80 + 100;
        this.height = Math.random() * 30 + 30;
        this.x = canvas.width;
        this.y = y;
        this.speed = gameSpeed / (Math.random() * 4 + 2); 
        this.color = 'white';
        this.markedForDeletion = false;
    }
    draw() {
        ctx.fillStyle = this.color;
        drawRoundedRect(this.x, this.y, this.width, this.height, 15);
        drawRoundedRect(this.x - 20, this.y + 10, this.width * 0.7, this.height * 0.7, 15);
        drawRoundedRect(this.x + this.width - 50, this.y + 5, this.width * 0.4, this.height * 0.9, 15);
    }
    update(timeFactor) {
        this.x -= this.speed * timeFactor;
        if (this.x + this.width < 0) {
            this.markedForDeletion = true;
        }
    }
}


// --- Класс Игрока (ОБНОВЛЕН: Step-Up, Var Jump, Jetpack, Visuals) ---
class Player {
    constructor() {
        this.width = 30;
        this.height = 50;
        this.x = 100; 
        this.y = canvas.height - this.height - 50; 
        this.vy = 0; 
        this.jumpPower = 6;
		this.movementSpeed = 3
        this.onGround = true;
        this.color = '#007BFF';
        this.projectiles = []; 
        this.currentPlatform = null;
        this.shootCooldown = 0; 
        
        this.powerUps = {
            highJump: false,
            slowFall: false,
            blaster: false,
            jetpack: false 
        };
        this.powerUpTimer = 0;
        
        // Coyote Time
        this.COYOTE_TIME_DURATION = 8; 
        this.coyoteTimeCounter = 0;
        this.isJumping = false; 
        this.isApplyingJetpackForce = false; // Флаг для отслеживания импульса

        // Джетпак
        this.jetpackForce = -0.35; 
        this.MAX_JETPACK_SPEED = -3; // Макс. скорость вверх от джетпака
        this.jetpackFuel = 100;    
        this.MAX_JETPACK_FUEL = 100;
        this.FUEL_CONSUMPTION = 0.5;
        this.FUEL_REGEN = 0.1;
        
        // Коллизия (Step-Up)
        this.step_size = 15; // Макс. высота "шага"
    }

    // НОВЫЙ МЕТОД: Отрисовка Усилений (для Визуала)
    drawPowerUps() {
        // 1. Slow Fall (Крылья)
        if (this.powerUps.slowFall) {
            ctx.fillStyle = 'white';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + 15);
            ctx.lineTo(this.x - 20, this.y + 10);
            ctx.lineTo(this.x, this.y + 25);
            ctx.closePath();
            ctx.fill();
            
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + 15);
            ctx.lineTo(this.x - 20, this.y + 20);
            ctx.lineTo(this.x, this.y + 35);
            ctx.closePath();
            ctx.fill();
        }

        // 2. High Jump (Ботинки)
        if (this.powerUps.highJump) {
            ctx.fillStyle = '#FFEB3B'; // Желтый
            drawRoundedRect(this.x + 2, this.y + this.height - 5, 10, 5, 2);
            drawRoundedRect(this.x + 18, this.y + this.height - 5, 10, 5, 2);
        }

        // 3. Jetpack (Рюкзак и Огонь)
        if (this.powerUps.jetpack) {
            // Рюкзак
            ctx.fillStyle = '#D32F2F'; // Красный
            drawRoundedRect(this.x - 8, this.y + 10, 8, 25, 3);
            
            // Огонь (если используется)
            if (this.isApplyingJetpackForce && this.jetpackFuel > 0) {
                ctx.fillStyle = 'orange';
                ctx.beginPath();
                ctx.moveTo(this.x - 8, this.y + 25);
                ctx.lineTo(this.x - 4, this.y + 40 + Math.random() * 5); // Рандом для "пламени"
                ctx.lineTo(this.x, this.y + 25);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    draw() {
        // Рисуем усиления ПОД игроком (Крылья, Ботинки, Джетпак)
        this.drawPowerUps();
        
        // Рисуем игрока
        ctx.fillStyle = this.color;
        drawRoundedRect(this.x, this.y, this.width, this.height, this.width / 2);
        
        // 4. Blaster (Пушка) - Рисуется ПОВЕРХ игрока
        if (this.powerUps.blaster) {
            ctx.fillStyle = 'black';
            drawRoundedRect(this.x + this.width - 5, this.y + this.height / 2 - 5, 10, 10, 3);
        }

        this.projectiles.forEach(p => p.draw());

        // Индикатор топлива (если джетпак активен)
        if (this.powerUps.jetpack) {
            ctx.fillStyle = 'gray';
            ctx.fillRect(this.x, this.y - 10, this.width, 5); // Фон
            ctx.fillStyle = this.jetpackFuel > 20 ? '#FFD700' : 'red'; // Желтый/Красный
            ctx.fillRect(this.x, this.y - 10, this.width * (this.jetpackFuel / this.MAX_JETPACK_FUEL), 5); // Топливо
        }
    }

    update(platforms, timeFactor) {
        // Горизонтальное движение
        if ((keys.ArrowRight || keys.KeyD) && this.x < canvas.width - this.width - 10) {
            this.x += this.movementSpeed * timeFactor * 0.8;
        }
        if ((keys.ArrowLeft || keys.KeyA) && this.x > 10) {
            this.x -= this.movementSpeed * timeFactor;
        }
        
        if (this.shootCooldown > 0) this.shootCooldown -= 1 * timeFactor;

        // Спуск с платформы
        if ((keys.ArrowDown || keys.KeyS) && this.onGround) {
            if (this.currentPlatform && this.currentPlatform.height > 40) {
                keys.ArrowDown = false; 
                keys.KeyS = false;
            } else {
                this.y += 2; 
                this.onGround = false;
                this.currentPlatform = null;
            }
        }

        // --- ЛОГИКА COYOTE TIME ---
        if (!this.onGround && !this.isJumping) {
            this.coyoteTimeCounter -= 1 * timeFactor; 
        }
        if (this.onGround) {
            this.coyoteTimeCounter = this.COYOTE_TIME_DURATION;
            this.isJumping = false;
        }
        
        this.isApplyingJetpackForce = false;
		
        // 1. Обычный Прыжок (С земли/края)
        if ((keys.ArrowUp || keys.KeyW || keys.Space) && (this.onGround || this.coyoteTimeCounter > 0) && !this.isJumping) {
            
            let currentJump = this.powerUps.highJump ? this.jumpPower * 1.2 : this.jumpPower;
            this.vy = -currentJump;
            
            this.onGround = false;
            this.coyoteTimeCounter = 0;
            this.isJumping = true; 
            
            sfx.jump.currentTime = 0; 
            sfx.jump.play().catch(e => console.log("Jump SFX blocked:", e));
        }
        
        // --- ЛОГИКА JETPACK ---
        else if (this.powerUps.jetpack && (keys.ArrowUp || keys.KeyW || keys.Space) && this.jetpackFuel > 0 && !this.onGround && this.isJumping) {
            
            this.isApplyingJetpackForce = true;
            
            // Применяем постоянную тягу, ТОЛЬКО если мы медленнее макс. скорости джетпака
            if (this.vy > this.MAX_JETPACK_SPEED) {
                this.vy += this.jetpackForce * timeFactor; 
                
                // Если мы *превысили* макс. скорость (стали быстрее), возвращаем на макс. скорость
                if (this.vy < this.MAX_JETPACK_SPEED) {
                    this.vy = this.MAX_JETPACK_SPEED;
                }
            }
            
            this.jetpackFuel -= this.FUEL_CONSUMPTION * timeFactor;
        }
        
        // Регенерация топлива
        if (!this.isApplyingJetpackForce && this.jetpackFuel < this.MAX_JETPACK_FUEL) {
            this.jetpackFuel = Math.min(this.MAX_JETPACK_FUEL, this.jetpackFuel + this.FUEL_REGEN * timeFactor);
        }
		
		// Гравитация
		let currentGravity = gravity;
		if (this.powerUps.slowFall && this.vy >= 0) {
			currentGravity *= 0.3; 
		}
		
		// НОВОЕ: Variable Jump - Меньше гравитации при зажатии прыжка
		// Применяется только если игрок НЕ НА ЗЕМЛЕ и скорость отрицательна (летит вверх)
		if (!this.onGround && this.vy < 0 && (keys.ArrowUp || keys.KeyW || keys.Space)) {
			// Применяем замедление только если НЕ АКТИВЕН ДЖЕТПАК
			if (!this.powerUps.jetpack) {
				currentGravity *= 0.6; // Уменьшаем гравитацию на фазе подъема
			}
		}
		this.vy += currentGravity * timeFactor;
		this.y += this.vy * timeFactor;
		
		// --- НОВАЯ ЛОГИКА: ОГРАНИЧЕНИЕ ПОТОЛКА ---
        const CEILING_HEIGHT = -20; 
        if (this.y < CEILING_HEIGHT) {
            this.y = CEILING_HEIGHT; 
            this.vy = Math.max(0, this.vy); 
        }
		
        // Столкновения с платформами
        this.onGround = false;
        this.currentPlatform = null;
        platforms.forEach(platform => {
            
            if ((keys.ArrowDown || keys.KeyS) && platform.height < 40) {
                return; 
            }
            
            // НОВОЕ: Логика Step-Up
            // Проверяем, на земле ли мы и движемся ли в стену
            if (this.vy >= 0 && (keys.ArrowRight || keys.KeyD)) {
                // Координаты проверки "ступеньки" (впереди и у ног)
                const stepCheckX = this.x + this.width;
                const stepCheckY_Bottom = this.y + this.height - 1;
                
                // Если мы касаемся платформы сбоку
                if (platform.x < stepCheckX && platform.x + platform.width > this.x &&
                    platform.y < stepCheckY_Bottom && platform.y + platform.height > this.y)
                {
                    const stepHeight = (this.y + this.height) - platform.y;
                    // Если стена - это ступенька (ниже step_size) и мы на нее "наступаем"
                    if (stepHeight > 0 && stepHeight <= this.step_size) {
                        this.onGround = true;
                        this.vy = 0;
                        this.y = platform.y - this.height; // "Телепорт" наверх
                        this.currentPlatform = platform;
						this.isJumping = false;
                        return; // Выходим из проверки этой платформы
                    }
                }
            }

            // Стандартная проверка на "приземление" (с расширенным хитбоксом)
            const PLATFORM_HITBOX_EXPAND = 20; 
            if (this.vy > 0 &&
                isColliding(this, platform, -PLATFORM_HITBOX_EXPAND / 2, 0, PLATFORM_HITBOX_EXPAND) && 
                this.y + this.height < platform.y + this.vy + 1)
            {
                this.onGround = true;
                this.vy = 0;
                this.y = platform.y - this.height;
                this.currentPlatform = platform;
				this.isJumping = false;
            }
        });

        // Падение в пропасть
        if (this.y > canvas.height) {
            triggerGameOver();
        }

        // Автоматическая Стрельба
        if (this.powerUps.blaster && this.shootCooldown <= 0) {
            this.shoot();
            this.shootCooldown += SHOOT_COOLDOWN_FRAMES; 
        }
        
        this.projectiles.forEach((p, index) => {
            p.update(timeFactor);
            if (p.x > canvas.width) {
                this.projectiles.splice(index, 1);
            }
        });

        // Таймер усилений
        if (this.powerUpTimer > 0) {
            this.powerUpTimer -= 1 * timeFactor;
            if (this.powerUpTimer <= 0) {
                this.resetPowerUps();
            }
        }
    }

    shoot() {
        if (this.projectiles.length < 5) {
            this.projectiles.push(new Projectile(this.x + this.width, this.y + this.height / 2));
        }
    }

    givePowerUp(type) {
        if (type === 'highJump') this.powerUps.highJump = true;
        if (type === 'slowFall') this.powerUps.slowFall = true;
        if (type === 'blaster') this.powerUps.blaster = true;
		if (type === 'jetpack') { 
            this.powerUps.jetpack = true;
            this.jetpackFuel = this.MAX_JETPACK_FUEL;
        }
        this.powerUpTimer = 600; 
    }

    resetPowerUps() {
        this.powerUps.highJump = false;
        this.powerUps.slowFall = false;
        this.powerUps.blaster = false;
		this.powerUps.jetpack = false;
    }
}

// --- Класс Projectile (Без изменений) ---
class Projectile {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 10;
        this.height = 5;
        this.color = 'yellow';
        this.speed = 7;
    }
    draw() {
        ctx.fillStyle = this.color;
        drawRoundedRect(this.x, this.y, this.width, this.height, 2);
    }
    update(timeFactor) {
        this.x += this.speed * timeFactor; 
    }
}

// --- Класс Platform (Без изменений) ---
class Platform {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = '#795548'; 
        this.markedForDeletion = false;
        this.topColor = '#4CAF50'; 
    }
    draw() {
        ctx.fillStyle = this.color;
        drawRoundedRect(this.x, this.y, this.width, this.height, 8);
        ctx.fillStyle = this.topColor;
        drawRoundedRect(this.x, this.y, this.width, Math.min(5, this.height), 8);
    }
    update(timeFactor) {
        this.x -= gameSpeed * timeFactor;
        if (this.x + this.width < 0) {
            this.markedForDeletion = true;
        }
    }
}

// --- Класс Enemy (ОБНОВЛЕНО: Увеличен гриб) ---
class Enemy {
    constructor(x, y, type) {
        this.type = type;
        this.markedForDeletion = false;
        this.x = x;
        this.y = y;
        this.vy = 0; 
        this.onGround = false; 
        this.currentPlatform = null;

        if (this.type === 'Slime') {
            this.width = 30;
            this.height = 30;
            this.color = '#388E3C'; 
			this.jumpPower = 5;
            this.jumpTimer = Math.random() * 120 + 60; 
        } else if (this.type === 'Mushroom') {
            this.width = 37.5; // Увеличен (было 25)
            this.height = 37.5; // Увеличен (было 25)
            this.color = '#D32F2F'; 
			this.movementSpeed = 0.2;
            this.fallCheckTimer = 30; 
        } else if (this.type === 'Bird') {
            this.width = 40;
            this.height = 20;
            this.color = '#03f4c0'; 
			this.movementSpeed = 0.8;
        }
    }

    draw() {
        if (this.type === 'Slime') {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + this.height, this.width / 2, Math.PI, 2 * Math.PI, false);
            ctx.lineTo(this.x + this.width, this.y + this.height);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.fillRect(this.x + this.width * 0.2, this.y + this.height * 0.4, 5, 5);
            ctx.fillRect(this.x + this.width * 0.6, this.y + this.height * 0.4, 5, 5);

        } else if (this.type === 'Mushroom') {
            // Ножка (масштабирована)
            ctx.fillStyle = '#FFECB3'; 
            drawRoundedRect(this.x + this.width * 0.3, this.y + this.height * 0.6, this.width * 0.4, this.height * 0.4, 4);
            
            // Шляпка (масштабирована)
            ctx.fillStyle = this.color; 
            ctx.beginPath();
            ctx.moveTo(this.x, this.y + this.height * 0.6);
            ctx.arcTo(this.x + this.width / 2, this.y, this.x + this.width, this.y + this.height * 0.6, 10);
            ctx.arcTo(this.x + this.width, this.y + this.height * 0.6, this.x + this.width, this.y + this.height, 5);
            ctx.lineTo(this.x, this.y + this.height * 0.6);
            ctx.closePath();
            ctx.fill();
            
        } else if (this.type === 'Bird') {
            ctx.fillStyle = this.color; 
            drawRoundedRect(this.x, this.y, this.width, this.height, this.height / 2);
            ctx.fillStyle = 'orange';
            ctx.beginPath();
            ctx.moveTo(this.x + this.width, this.y + this.height * 0.5);
            ctx.lineTo(this.x + this.width + 5, this.y + this.height * 0.3);
            ctx.lineTo(this.x + this.width + 5, this.y + this.height * 0.7);
            ctx.closePath();
            ctx.fill();
        }
    }

    update(platforms, timeFactor) { 
        this.x -= gameSpeed * timeFactor;

        if (this.type === 'Slime') {
            this.vy += gravity * timeFactor;
            this.y += this.vy * timeFactor;
            this.onGround = false;
            platforms.forEach(platform => {
                if (this.vy > 0 &&
                    isColliding(this, platform) && // Используем простой isColliding для мобов
                    this.y + this.height < platform.y + this.vy + 1)
                {
                    this.y = platform.y - this.height;
                    this.vy = 0;
                    this.onGround = true;
                }
            });
            if (this.onGround) {
                this.jumpTimer -= 1 * timeFactor;
                if (this.jumpTimer <= 0) {
                    this.vy = -(this.jumpPower); 
                    this.onGround = false;
                    this.jumpTimer = Math.random() * 120 + 60;
                }
            }
        } else if (this.type === 'Mushroom') {
            this.x -= this.movementSpeed * timeFactor; 
            
            if (this.fallCheckTimer > 0) {
                this.fallCheckTimer -= 1 * timeFactor;
            } else {
                this.vy += gravity * timeFactor;
            }
            this.y += this.vy * timeFactor;
            
            this.onGround = false;
            platforms.forEach(platform => {
                if (this.vy > 0 &&
                    isColliding(this, platform) && // Используем простой isColliding для мобов
                    this.y + this.height < platform.y + this.vy + 1)
                {
                    this.y = platform.y - this.height;
                    this.vy = 0;
                    this.onGround = true;
                }
            });

            if (this.y > canvas.height) {
                this.markedForDeletion = true;
            }
            
        } else if (this.type === 'Bird') {
            this.x -= this.movementSpeed * timeFactor;
        }

        if (this.x + this.width < 0) {
            this.markedForDeletion = true;
        }
    }
}

// --- Класс Collectible (Без изменений) ---
class Collectible {
    constructor(x, y, type) {
        this.type = type; 
        this.width = (type === 'coin') ? 15 : 25;
        this.height = (type === 'coin') ? 15 : 20;
        this.x = x;
        this.y = y;
        this.color = (type === 'coin') ? '#FFD700' : '#8B4513';
        this.markedForDeletion = false;
    }
    draw() {
        ctx.fillStyle = this.color;
        
        if (this.type === 'coin') {
            ctx.beginPath();
            ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'chest') {
            drawRoundedRect(this.x, this.y, this.width, this.height, 4);
            ctx.fillStyle = '#696969';
            ctx.fillRect(this.x + this.width/2 - 2, this.y + this.height * 0.3, 4, 6);
        }
    }
    update(timeFactor) {
        this.x -= gameSpeed * timeFactor;
        if (this.x + this.width < 0) {
            this.markedForDeletion = true;
        }
    }
}


// --- Инициализация ---
let player = new Player();
let platforms = [];
let enemies = [];
let collectibles = [];
let clouds = []; 

function init() {
    player = new Player();
    platforms = [];
    enemies = [];
    collectibles = [];
    clouds = []; 
    score = 0;
    gameFrame = 0;
    gameSpeed = BASE_GAME_SPEED;
    platformSpawnTimer = 0; // Сброс таймеров
    birdSpawnTimer = 0;
    cloudSpawnAccumulator = 0;
	
    for (let key in keys) {
        keys[key] = false;
    }
    
    const initialGroundThickness = GROUND_PLATFORM_MIN_THICKNESS;
    platforms.push(new Platform(0, canvas.height - initialGroundThickness, canvas.width + 200, initialGroundThickness));
    
    for (let i = 0; i < 5; i++) {
        clouds.push(new Cloud(Math.random() * 200 + 50));
        clouds[i].x = Math.random() * canvas.width;
    }
	
    BGM.play().catch(error => {
        console.log("Music play blocked, waiting for user interaction.", error);
    });
	
    gameState = 'playing';
}

// --- Фон и Облака ---
function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#87CEEB'); 
    gradient.addColorStop(0.7, '#6495ED'); 
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function handleClouds(timeFactor) { 
    const CLOUD_SPAWN_INTERVAL_FRAMES = 300;
    
    if (gameState === 'playing') {
        cloudSpawnAccumulator += 1 * timeFactor; 
        
        if (cloudSpawnAccumulator >= CLOUD_SPAWN_INTERVAL_FRAMES && clouds.length < 10) {
            clouds.push(new Cloud(Math.random() * 200 + 50));
            cloudSpawnAccumulator -= CLOUD_SPAWN_INTERVAL_FRAMES; 
        }
    }
    
    for (let i = clouds.length - 1; i >= 0; i--) {
        clouds[i].update(timeFactor);
        clouds[i].draw();
        if (clouds[i].markedForDeletion) {
            clouds.splice(i, 1);
        }
    }
}

// --- Вспомогательная функция для спауна сущностей (Без изменений) ---
function spawnEntityOnPlatform(platform) {
    let r_entity = Math.random();
    let spawnX = platform.x + platform.width / 2; 
    let spawnY = platform.y - 40; 
    const COIN_OFFSET = 10; 
    let cumulativeChance = 0;
    
    if (r_entity < (cumulativeChance += SPAWN_CHANCE_SLIME)) {
        enemies.push(new Enemy(spawnX, spawnY, 'Slime'));
    } else if (r_entity < (cumulativeChance += SPAWN_CHANCE_MUSHROOM)) {
        enemies.push(new Enemy(spawnX, spawnY, 'Mushroom'));
    } else if (r_entity < (cumulativeChance += SPAWN_CHANCE_COIN)) {
        collectibles.push(new Collectible(spawnX, spawnY + COIN_OFFSET, 'coin'));
    } else if (r_entity < (cumulativeChance += SPAWN_CHANCE_CHEST)) {
        collectibles.push(new Collectible(spawnX, spawnY, 'chest'));
    }
}

// --- Спаунер (Без изменений) ---
function handleSpawners(timeFactor) {
    
    // 1. Накапливаем время
    platformSpawnTimer += 1 * timeFactor;
    birdSpawnTimer += 1 * timeFactor;
    
    // 2. Нормализация интервалов спауна
    const speedRatio = BASE_GAME_SPEED / gameSpeed; 
    const adjustedPlatformInterval = PLATFORM_SPAWN_INTERVAL * speedRatio;
    const adjustedBirdInterval = BIRD_SPAWN_INTERVAL * speedRatio;
    
    // 3. Спаун Платформ
    if (platformSpawnTimer >= adjustedPlatformInterval) {
        let lastPlatform = platforms[platforms.length - 1];
        let gap = Math.random() * 100 + 40; 
        let newX = lastPlatform.x + lastPlatform.width + gap;
        let pathPlatform = null;
        let r_path = Math.random();
        
        let randomThickness = Math.random() * (GROUND_PLATFORM_MAX_THICKNESS - GROUND_PLATFORM_MIN_THICKNESS) + GROUND_PLATFORM_MIN_THICKNESS;
        randomThickness = Math.round(randomThickness);
        
        if (r_path < CHANCE_OF_GAP) {
            pathPlatform = new Platform(newX + 200, canvas.height - randomThickness, 300, randomThickness);
        } else {
            let newWidth = Math.random() * 120 + 80;
            pathPlatform = new Platform(newX, canvas.height - randomThickness, newWidth, randomThickness);
        }
        
        platforms.push(pathPlatform);
        spawnEntityOnPlatform(pathPlatform);

        let r_air = Math.random();
        if (r_air < CHANCE_OF_AIR_PLATFORM) {
            let airWidth = Math.random() * 100 + 60;
            let airY = Math.random() * (AIR_PLATFORM_MAX_Y - AIR_PLATFORM_MIN_Y) + AIR_PLATFORM_MIN_Y; 
            airY = Math.round(airY);
            let spaceStart = lastPlatform.x + lastPlatform.width + 50;
            let spaceEnd = pathPlatform.x - airWidth - 50;
            
            let airX;
            if (spaceEnd > spaceStart) {
                airX = Math.random() * (spaceEnd - spaceStart) + spaceStart;
            } else {
                airX = pathPlatform.x + pathPlatform.width / 2 - airWidth / 2;
            }
            const airPlatform = new Platform(airX, airY, airWidth, 20);
            platforms.push(airPlatform);
            
            if (Math.random() < 0.5) { 
                spawnEntityOnPlatform(airPlatform);
            }
        }
        
        platformSpawnTimer -= adjustedPlatformInterval;
    }
    
    // 4. Спаун Птиц
    if (birdSpawnTimer >= adjustedBirdInterval) { 
        let spawnY_bird = Math.random() * (BIRD_MAX_Y - BIRD_MIN_Y) + BIRD_MIN_Y;
        spawnY_bird = Math.round(spawnY_bird);
        enemies.push(new Enemy(canvas.width + 50, spawnY_bird, 'Bird')); 
        birdSpawnTimer -= adjustedBirdInterval; 
    }
}


// --- Обработка Столкновений (ОБНОВЛЕНО: Тонкий хитбокс для смерти) ---
function handleCollisions() {
    
    // Хитбокс для удобного подбора и запрыгивания
    const WIDE_HITBOX_EXPAND = 20; 
    // Хитбокс для "честной" смерти (должен быть меньше ширины игрока)
    const TIGHT_HITBOX_INSET = 10; // 5px с каждой стороны

    // 1. Игрок vs Враги
    enemies.forEach((enemy, index) => {
        
        // --- 1a. Проверка "Смерти Врага" (Широкая коллизия сверху) ---
        if (player.vy > 0 && 
            player.y + player.height < enemy.y + 20 &&
            isColliding(player, enemy, -WIDE_HITBOX_EXPAND / 2, 0, WIDE_HITBOX_EXPAND))
        {
            enemies.splice(index, 1);
            player.vy = -5; 
            score += 10;
            sfx.death.currentTime = 0;
            sfx.death.play().catch(e => console.log("Death SFX blocked:", e));
        } 
        
        // --- 1b. Проверка "Смерти Игрока" (Тонкая/внутренняя коллизия) ---
        // Игрок умирает, только если хитбоксы пересекаются на TIGHT_HITBOX_INSET
        else if (isColliding(player, enemy, TIGHT_HITBOX_INSET / 2, 0, -TIGHT_HITBOX_INSET)) {
            triggerGameOver();
        }
    });

    // 2. Игрок vs Коллекционные предметы (Широкий хитбокс)
    collectibles.forEach((item, index) => {
        if (isColliding(player, item, -WIDE_HITBOX_EXPAND / 2, 0, WIDE_HITBOX_EXPAND)) {
            if (item.type === 'coin') {
                score += 5;
                sfx.coin.currentTime = 0;
                sfx.coin.play().catch(e => console.log("Coin SFX blocked:", e));

            } else if (item.type === 'chest') {
                let powerUpTypes = ['highJump', 'slowFall', 'blaster', 'jetpack']; 
                let randomType = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
                player.givePowerUp(randomType);
                sfx.chest.currentTime = 0;
                sfx.chest.play().catch(e => console.log("Chest SFX blocked:", e));
            }
            collectibles.splice(index, 1); 
        }
    });

    // 3. Выстрелы vs Враги (Стандартный хитбокс)
    player.projectiles.forEach((p, pIndex) => {
        enemies.forEach((enemy, eIndex) => {
            if (isColliding(p, enemy)) {
                player.projectiles.splice(pIndex, 1);
                enemies.splice(eIndex, 1);
                score += 10;
                sfx.death.currentTime = 0;
                sfx.death.play().catch(e => console.log("Death SFX blocked:", e));
            }
        });
    });
}

// --- Вспомогательная функция AABB (ОБНОВЛЕНО: с кастомным хитбоксом) ---
function isColliding(rect1, rect2, offsetX = 0, offsetY = 0, widthIncrease = 0) {
    const rect1X = rect1.x + offsetX;
    const rect1Y = rect1.y + offsetY;
    const rect1Width = rect1.width + widthIncrease;
    const rect1Height = rect1.height;
    
    return rect1X < rect2.x + rect2.width &&
           rect1X + rect1Width > rect2.x &&
           rect1Y < rect2.y + rect2.height &&
           rect1Y + rect1Height > rect2.y;
}

// --- Функции состояний (Без изменений) ---
function drawMenu() {
    drawBackground(); 

    ctx.fillStyle = 'black';
    ctx.font = '50px "Verdana", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Runner Game', canvas.width / 2, canvas.height / 2 - 100);

    ctx.font = '24px "Verdana", sans-serif';
    ctx.fillText(`High Score: ${highScore}`, canvas.width / 2, canvas.height / 2 - 40);

    ctx.fillStyle = '#4CAF50'; 
    drawRoundedRect(startButton.x, startButton.y, startButton.width, startButton.height, 10);
    
    ctx.fillStyle = 'white';
    ctx.font = '30px "Verdana", sans-serif';
    ctx.fillText('Start Game', canvas.width / 2, startButton.y + 35);
    
    ctx.fillStyle = 'black';
    ctx.font = '20px "Verdana", sans-serif';
    ctx.fillText('Press Enter to start', canvas.width / 2, startButton.y + 80);
}

function triggerGameOver() {
    gameState = 'gameOver';
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('runnerHighScore', highScore);
    }
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = '50px "Verdana", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40);
    
    ctx.font = '24px "Verdana", sans-serif';
    ctx.fillText(`Your Score: ${score}`, canvas.width / 2, canvas.height / 2 + 10);
    
    ctx.font = '20px "Verdana", sans-serif';
    ctx.fillText('Press Enter to return to menu', canvas.width / 2, canvas.height / 2 + 60);
}

function drawPauseScreen() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = '70px "Verdana", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 40);
    
    ctx.font = '30px "Verdana", sans-serif';
    ctx.fillText('Press ESC to resume', canvas.width / 2, canvas.height / 2 + 30);
}

function drawUI() {
    ctx.fillStyle = 'black';
    ctx.font = GAME_FONT;
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 20, 30);
    
    if(player.powerUpTimer > 0) {
        let type = 'Active Power-Ups: ';
        let bonuses = [];

        if (player.powerUps.highJump) bonuses.push('Jump Power');
        if (player.powerUps.slowFall) bonuses.push('Slow Fall');
        if (player.powerUps.blaster) bonuses.push('Blaster');
		if (player.powerUps.jetpack) bonuses.push('Jetpack');
        
        type += bonuses.join(' + ');

        ctx.fillStyle = '#FFEB3B'; 
        ctx.fillText(`${type}: ${Math.ceil(player.powerUpTimer / 60)}s`, 20, 60);
    }
}

// --- Главный Игровой Цикл (Без изменений) ---
function loop(currentTime) {
	if (lastTime === 0) {
        lastTime = currentTime;
    }
	const deltaTime = currentTime - lastTime;
    const timeFactor = Math.min(deltaTime / TIME_STEP, 3);
    
    if (gameState === 'playing') {
		
        if (score >= SPEED_INCREASE_THRESHOLD * (Math.floor((gameSpeed - BASE_GAME_SPEED) / SPEED_INCREASE_AMOUNT) + 1)) {
            gameSpeed += SPEED_INCREASE_AMOUNT;
            console.log(`Speed increased to: ${gameSpeed}`);
        }
		
        drawBackground(); 
        handleClouds(timeFactor); 
    
        [platforms, enemies, collectibles, player.projectiles].forEach(arr => {
            for (let i = arr.length - 1; i >= 0; i--) {
                const item = arr[i];
                if (item.constructor.name === 'Enemy') {
                    item.update(platforms, timeFactor);
                } else if (item.constructor.name === 'Platform' || item.constructor.name === 'Collectible' || item.constructor.name === 'Projectile' || item.constructor.name === 'Cloud') {
                    item.update(timeFactor); 
                }
                
                item.draw();
                if (item.markedForDeletion) {
                    arr.splice(i, 1);
                }
            }
        });

        player.update(platforms, timeFactor); 
        player.draw();

        handleSpawners(timeFactor);
        handleCollisions();
        
        drawUI();

    } else if (gameState === 'paused') {
        
        drawBackground(); 
        handleClouds(timeFactor * 0); 
        [platforms, enemies, collectibles].forEach(arr => {
            arr.forEach(item => item.draw());
        });
        player.draw();
        drawUI();
        
        drawPauseScreen();
        
    } else if (gameState === 'menu') {
        drawMenu();
    } else if (gameState === 'gameOver') {
        drawGameOver();
    }

    lastTime = currentTime;
    requestAnimationFrame(loop);
}

// --- Запуск Игры ---
loop();

// --- Управление Громкостью ---
const volumeSlider = document.getElementById('volumeSlider');
const volumeValueDisplay = document.getElementById('volumeValue');

if (volumeSlider) {
    BGM.volume = volumeSlider.value / 100;
    volumeSlider.addEventListener('input', () => {
        const volumePercentage = volumeSlider.value;
        BGM.volume = volumePercentage / 100;
        if (volumeValueDisplay) {
            volumeValueDisplay.textContent = volumePercentage;
        }
    });
}

// --- Управление Громкостью SFX ---
const sfxVolumeSlider = document.getElementById('sfxVolumeSlider');
const sfxVolumeDisplay = document.getElementById('sfxVolumeValue');

if (sfxVolumeSlider) {
    sfxVolumeMultiplier = sfxVolumeSlider.value / 100;
    
    const updateSfxVolume = () => {
        sfxVolumeMultiplier = sfxVolumeSlider.value / 100;
        
        sfx.jump.volume = 0.5 * sfxVolumeMultiplier;
        sfx.death.volume = 0.6 * sfxVolumeMultiplier;
        sfx.coin.volume = 0.4 * sfxVolumeMultiplier;
        sfx.chest.volume = 0.7 * sfxVolumeMultiplier;
        
        if (sfxVolumeDisplay) {
            sfxVolumeDisplay.textContent = sfxVolumeSlider.value;
        }
    };
    sfxVolumeSlider.addEventListener('input', updateSfxVolume);
    updateSfxVolume();
}
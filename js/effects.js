/**
 * 特效引擎 - 直播间动效GIF生成器
 * 定义所有特效模板及其渲染逻辑
 */

// ===== 工具函数 =====

function easeOutElastic(x) {
    const c4 = (2 * Math.PI) / 3;
    return x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

function easeOutBack(x) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function easeOutQuad(x) {
    return 1 - (1 - x) * (1 - x);
}

function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function drawStar(ctx, cx, cy, outerRadius, innerRadius, points, rotation) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (i * Math.PI / points) - Math.PI / 2 + rotation;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
}

function drawSparkle(ctx, x, y, size, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = '#fff';
    
    // 十字闪光
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.15, size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, size, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

// 伪随机生成器（确定性）
function seededRandom(seed) {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

// 计算图片在画布中的适配尺寸（保持宽高比，不超出画布70%）
function getFitSize(image, canvasW, canvasH, maxRatio = 0.7) {
    const maxW = canvasW * maxRatio;
    const maxH = canvasH * maxRatio;
    const imgRatio = image.width / image.height;
    
    let w, h;
    if (imgRatio > maxW / maxH) {
        w = maxW;
        h = maxW / imgRatio;
    } else {
        h = maxH;
        w = maxH * imgRatio;
    }
    return { width: w, height: h };
}

// 多图切换：获取当前图片索引和切换进度
function getMultiSlideInfo(progress, imagesCount, holdRatio = 0.7) {
    const segment = 1 / imagesCount;
    const index = Math.floor(progress / segment);
    const segmentProgress = (progress % segment) / segment;
    const isTransition = segmentProgress > holdRatio;
    return {
        currentIndex: Math.min(index, imagesCount - 1),
        nextIndex: (index + 1) % imagesCount,
        transitionProgress: isTransition ? (segmentProgress - holdRatio) / (1 - holdRatio) : 0,
        isTransition
    };
}

// 绘制圆角矩形路径
function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ===== 粒子系统 =====
class ParticleSystem {
    constructor(count, seed) {
        this.particles = [];
        for (let i = 0; i < count; i++) {
            const s = seed + i * 137.5;
            const angle = seededRandom(s) * Math.PI * 2;
            const speed = 0.3 + seededRandom(s + 1) * 1.2;
            const size = 1.5 + seededRandom(s + 2) * 4;
            const hue = 35 + seededRandom(s + 3) * 40; // 金黄到橙色
            const lifeVar = 0.5 + seededRandom(s + 4) * 0.5;
            
            this.particles.push({
                angle,
                speed,
                size,
                hue,
                lifeVar,
                x: 0,
                y: 0,
                alpha: 1
            });
        }
    }
    
    update(progress) {
        this.particles.forEach(p => {
            const life = clamp(progress / p.lifeVar, 0, 1);
            p.x = Math.cos(p.angle) * p.speed * life;
            p.y = Math.sin(p.angle) * p.speed * life;
            p.alpha = clamp(1 - life * 1.5, 0, 1);
        });
    }
}

// ===== 特效定义 =====

const EFFECTS = {

    streamBorder: {
        id: 'streamBorder',
        name: '流光边框',
        description: '直播间卡片动态流光描边，克制实用',
        icon: '🟦',
        params: [
            { id: 'borderWidth', name: '边框宽度', type: 'range', min: 2, max: 12, step: 1, default: 4, suffix: 'px' },
            { id: 'borderRadius', name: '圆角大小', type: 'range', min: 0, max: 40, step: 2, default: 12, suffix: 'px' },
            { id: 'glowIntensity', name: '发光强度', type: 'range', min: 0, max: 100, step: 10, default: 40, suffix: '%' },
            { id: 'hueSpeed', name: '流光速度', type: 'range', min: 1, max: 10, step: 1, default: 4, suffix: '级' },
            { id: 'bgColor', name: '背景颜色', type: 'color', default: '#000000' },
            { id: 'borderColor', name: '边框色', type: 'color', default: '#58a6ff' }
        ],
        
        init() {},
        
        render(ctx, progress, image, params, width, height, images = []) {
            const cx = width / 2;
            const cy = height / 2;
            const p = { ...this.paramsDefault(), ...params };
            const borderW = p.borderWidth || 4;
            const radius = p.borderRadius || 12;
            const glow = (p.glowIntensity || 40) / 100;
            const speed = p.hueSpeed || 4;
            
            if (!p.transparent) {
                ctx.fillStyle = p.bgColor || '#000000';
                ctx.fillRect(0, 0, width, height);
            }
            
            const fit = getFitSize(image, width, height, 0.65);
            const imgX = cx - fit.width / 2;
            const imgY = cy - fit.height / 2;
            
            const hueShift = progress * speed * 360;
            
            if (glow > 0) {
                ctx.save();
                ctx.shadowColor = `hsl(${(hueShift + 180) % 360}, 100%, 65%)`;
                ctx.shadowBlur = 15 * glow;
                roundRectPath(ctx, imgX - borderW, imgY - borderW, fit.width + borderW * 2, fit.height + borderW * 2, radius + borderW);
                ctx.strokeStyle = `hsl(${hueShift % 360}, 100%, 65%)`;
                ctx.lineWidth = borderW;
                ctx.stroke();
                ctx.restore();
            }
            
            roundRectPath(ctx, imgX - borderW, imgY - borderW, fit.width + borderW * 2, fit.height + borderW * 2, radius + borderW);
            ctx.strokeStyle = `hsl(${hueShift % 360}, 100%, 65%)`;
            ctx.lineWidth = borderW;
            ctx.stroke();
            
            roundRectPath(ctx, imgX - borderW * 0.5, imgY - borderW * 0.5, fit.width + borderW, fit.height + borderW, radius + borderW * 0.5);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.save();
            roundRectPath(ctx, imgX, imgY, fit.width, fit.height, radius);
            ctx.clip();
            ctx.drawImage(image, imgX, imgY, fit.width, fit.height);
            ctx.restore();
            
            const cornerSize = 6;
            const corners = [
                [imgX - borderW, imgY - borderW],
                [imgX + fit.width + borderW, imgY - borderW],
                [imgX - borderW, imgY + fit.height + borderW],
                [imgX + fit.width + borderW, imgY + fit.height + borderW]
            ];
            const blink = Math.sin(progress * Math.PI * 2) * 0.3 + 0.7;
            ctx.fillStyle = `hsl(${(hueShift + 180) % 360}, 100%, 70%)`;
            ctx.globalAlpha = blink;
            corners.forEach(([x, y]) => {
                ctx.beginPath();
                ctx.arc(x, y, cornerSize * 0.5, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;
        },
        
        paramsDefault() {
            return { borderWidth: 4, borderRadius: 12, glowIntensity: 40, hueSpeed: 4, bgColor: '#000000', borderColor: '#58a6ff' };
        }
    },
    
    breathPulse: {
        id: 'breathPulse',
        name: '呼吸脉冲',
        description: '直播间标识柔和呼吸闪烁，适合角标/上新',
        icon: '💡',
        params: [
            { id: 'pulseSpeed', name: '呼吸速度', type: 'range', min: 1, max: 10, step: 1, default: 4, suffix: '级' },
            { id: 'maxScale', name: '最大缩放', type: 'range', min: 1, max: 1.15, step: 0.01, default: 1.05, suffix: 'x' },
            { id: 'glowSize', name: '发光大小', type: 'range', min: 0, max: 30, step: 2, default: 10, suffix: 'px' },
            { id: 'bgColor', name: '背景颜色', type: 'color', default: '#000000' }
        ],
        
        init() {},
        
        render(ctx, progress, image, params, width, height, images = []) {
            const cx = width / 2;
            const cy = height / 2;
            const p = { ...this.paramsDefault(), ...params };
            const speed = p.pulseSpeed || 4;
            const maxScale = p.maxScale || 1.05;
            const glowSize = p.glowSize || 10;
            
            if (!p.transparent) {
                ctx.fillStyle = p.bgColor || '#000000';
                ctx.fillRect(0, 0, width, height);
            }
            
            const pulse = Math.sin(progress * Math.PI * speed * 2) * 0.5 + 0.5;
            const scale = 1 + (maxScale - 1) * pulse;
            const alpha = 0.85 + pulse * 0.15;
            
            const fit = getFitSize(image, width, height, 0.65);
            
            if (glowSize > 0) {
                ctx.save();
                ctx.globalAlpha = pulse * 0.4;
                ctx.shadowColor = '#fff';
                ctx.shadowBlur = glowSize * 2;
                const gw = fit.width * scale * 1.02;
                const gh = fit.height * scale * 1.02;
                ctx.drawImage(image, cx - gw/2, cy - gh/2, gw, gh);
                ctx.restore();
            }
            
            ctx.save();
            ctx.globalAlpha = alpha;
            const imgW = fit.width * scale;
            const imgH = fit.height * scale;
            ctx.drawImage(image, cx - imgW/2, cy - imgH/2, imgW, imgH);
            ctx.restore();
            
            ctx.globalAlpha = 1;
        },
        
        paramsDefault() {
            return { pulseSpeed: 4, maxScale: 1.05, glowSize: 10, bgColor: '#000000' };
        }
    },
    
    multiSlide: {
        id: 'multiSlide',
        name: '多图轮播',
        description: '多张图片自动切换，适合商品组图展示',
        icon: '🔄',
        params: [
            { id: 'switchSpeed', name: '切换速度', type: 'range', min: 1, max: 10, step: 1, default: 5, suffix: '级' },
            { id: 'transitionType', name: '过渡方式', type: 'select', default: 'fade', options: ['fade', 'slide', 'zoom'] },
            { id: 'bgColor', name: '背景颜色', type: 'color', default: '#000000' }
        ],
        
        init() {},
        
        render(ctx, progress, image, params, width, height, images = []) {
            const cx = width / 2;
            const cy = height / 2;
            const p = { ...this.paramsDefault(), ...params };
            const speed = p.switchSpeed || 5;
            const transitionType = p.transitionType || 'fade';
            
            if (!p.transparent) {
                ctx.fillStyle = p.bgColor || '#000000';
                ctx.fillRect(0, 0, width, height);
            }
            
            const allImages = images.length > 0 ? [...images] : [image];
            const totalImages = allImages.length;
            if (totalImages === 0) return;
            
            const info = getMultiSlideInfo(progress, totalImages, 0.7);
            const currentImg = allImages[info.currentIndex];
            const nextImg = allImages[info.nextIndex];
            
            const fit = getFitSize(currentImg, width, height, 0.65);
            
            if (transitionType === 'fade') {
                ctx.save();
                ctx.globalAlpha = 1 - info.transitionProgress;
                ctx.drawImage(currentImg, cx - fit.width/2, cy - fit.height/2, fit.width, fit.height);
                ctx.restore();
                
                if (info.isTransition) {
                    ctx.save();
                    ctx.globalAlpha = info.transitionProgress;
                    ctx.drawImage(nextImg, cx - fit.width/2, cy - fit.height/2, fit.width, fit.height);
                    ctx.restore();
                }
            } else if (transitionType === 'slide') {
                const slideX = info.isTransition ? info.transitionProgress * width * 0.8 : 0;
                ctx.drawImage(currentImg, cx - fit.width/2 - slideX, cy - fit.height/2, fit.width, fit.height);
                if (info.isTransition) {
                    ctx.drawImage(nextImg, cx - fit.width/2 + width * 0.8 - slideX, cy - fit.height/2, fit.width, fit.height);
                }
            } else if (transitionType === 'zoom') {
                const zoomOut = 1 - info.transitionProgress * 0.3;
                const zoomIn = 0.7 + info.transitionProgress * 0.3;
                ctx.save();
                ctx.globalAlpha = 1 - info.transitionProgress * 0.5;
                ctx.drawImage(currentImg, cx - fit.width * zoomOut / 2, cy - fit.height * zoomOut / 2, fit.width * zoomOut, fit.height * zoomOut);
                ctx.restore();
                if (info.isTransition) {
                    ctx.save();
                    ctx.globalAlpha = info.transitionProgress;
                    ctx.drawImage(nextImg, cx - fit.width * zoomIn / 2, cy - fit.height * zoomIn / 2, fit.width * zoomIn, fit.height * zoomIn);
                    ctx.restore();
                }
            }
            
            const dotSize = 6;
            const gap = 12;
            const totalWidth = totalImages * dotSize + (totalImages - 1) * gap;
            const startX = cx - totalWidth / 2 + dotSize / 2;
            const dotY = height - 20;
            
            for (let i = 0; i < totalImages; i++) {
                const isActive = i === info.currentIndex;
                ctx.beginPath();
                ctx.arc(startX + i * gap, dotY, isActive ? dotSize * 0.8 : dotSize * 0.5, 0, Math.PI * 2);
                ctx.fillStyle = isActive ? '#58a6ff' : 'rgba(255,255,255,0.3)';
                ctx.fill();
            }
        },
        
        paramsDefault() {
            return { switchSpeed: 5, transitionType: 'fade', bgColor: '#000000' };
        }
    },
    
    shining: {
        id: 'shining',
        name: '闪亮登场',
        description: '上货/新品推荐，金色粒子爆发+弹性放大',
        icon: '✨',
        params: [
            { id: 'particleCount', name: '粒子数量', type: 'range', min: 20, max: 150, step: 10, default: 60, suffix: '个' },
            { id: 'glowIntensity', name: '光晕强度', type: 'range', min: 0, max: 100, step: 10, default: 50, suffix: '%' },
            { id: 'scale', name: '放大倍数', type: 'range', min: 0.5, max: 1.5, step: 0.1, default: 1.0, suffix: 'x' },
            { id: 'bgColor', name: '背景颜色', type: 'color', default: '#000000' }
        ],
        
        init(width, height, params) {
            this.system = new ParticleSystem(params.particleCount || 60, 42);
            this.sparkles = [];
            for (let i = 0; i < 8; i++) {
                this.sparkles.push({
                    x: seededRandom(i * 77) * width,
                    y: seededRandom(i * 93) * height,
                    size: 10 + seededRandom(i * 51) * 30,
                    rot: seededRandom(i * 31) * Math.PI,
                    delay: seededRandom(i * 67) * 0.4,
                    speed: 0.5 + seededRandom(i * 43) * 1.5
                });
            }
        },
        
        render(ctx, progress, image, params, width, height) {
            const cx = width / 2;
            const cy = height / 2;
            const p = { ...this.paramsDefault(), ...params };
            
            // 背景
            if (!p.transparent) {
                ctx.fillStyle = p.bgColor || '#000000';
                ctx.fillRect(0, 0, width, height);
            }
            
            // 更新粒子
            this.system.update(progress);
            
            // 绘制粒子
            const maxDist = Math.min(width, height) * 0.5;
            this.system.particles.forEach(pt => {
                if (pt.alpha <= 0) return;
                const px = cx + pt.x * maxDist;
                const py = cy + pt.y * maxDist;
                ctx.globalAlpha = pt.alpha * 0.8;
                ctx.fillStyle = `hsl(${pt.hue}, 100%, 65%)`;
                ctx.beginPath();
                ctx.arc(px, py, pt.size * (1 - progress * 0.2), 0, Math.PI * 2);
                ctx.fill();
            });
            
            // 粒子拖尾（简单实现）
            ctx.globalAlpha = 0.3;
            this.system.particles.forEach(pt => {
                if (pt.alpha <= 0.1) return;
                const px = cx + pt.x * maxDist;
                const py = cy + pt.y * maxDist;
                const tailX = cx + pt.x * maxDist * 0.7;
                const tailY = cy + pt.y * maxDist * 0.7;
                ctx.strokeStyle = `hsl(${pt.hue}, 100%, 65%)`;
                ctx.lineWidth = pt.size * 0.5;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(tailX, tailY);
                ctx.stroke();
            });
            
            // 闪光星星
            this.sparkles.forEach(sp => {
                const spProgress = clamp((progress - sp.delay) / 0.5, 0, 1);
                if (spProgress <= 0) return;
                const spAlpha = Math.sin(spProgress * Math.PI);
                ctx.globalAlpha = spAlpha * 0.9;
                drawSparkle(ctx, sp.x, sp.y, sp.size * (0.5 + spProgress * 0.5), sp.rot + progress * sp.speed);
            });
            
            // 中心大闪光
            if (progress < 0.25) {
                const flashP = progress / 0.25;
                const flashAlpha = Math.sin(flashP * Math.PI);
                ctx.globalAlpha = flashAlpha * 0.6;
                ctx.fillStyle = '#fff';
                drawStar(ctx, cx, cy, 80 + flashP * 40, 20, 8, progress * 2);
            }
            
            // 绘制素材 - 弹性放大
            ctx.globalAlpha = 1;
            const scale = easeOutElastic(clamp(progress * 1.2, 0, 1)) * p.scale;
            
            // 素材光晕
            if (progress < 0.6 && p.glowIntensity > 0) {
                const glowAlpha = (0.6 - progress) / 0.6 * (p.glowIntensity / 100) * 0.4;
                ctx.save();
                ctx.globalAlpha = glowAlpha;
                ctx.shadowColor = '#ffd700';
                ctx.shadowBlur = 50;
                const glowScale = scale * 1.05;
                const fit = getFitSize(image, width, height);
                const gw = fit.width * glowScale;
                const gh = fit.height * glowScale;
                ctx.drawImage(image, cx - gw/2, cy - gh/2, gw, gh);
                ctx.restore();
            }
            
            ctx.globalAlpha = 1;
            const fit = getFitSize(image, width, height);
            const imgW = fit.width * scale;
            const imgH = fit.height * scale;
            ctx.drawImage(image, cx - imgW/2, cy - imgH/2, imgW, imgH);
        },
        
        paramsDefault() {
            return { particleCount: 60, glowIntensity: 50, scale: 1.0, bgColor: '#000000' };
        }
    },
    
    warning: {
        id: 'warning',
        name: '闪烁预警',
        description: '库存紧张/限时提醒，红底脉冲闪烁',
        icon: '⚠️',
        params: [
            { id: 'blinkSpeed', name: '闪烁速度', type: 'range', min: 1, max: 10, step: 1, default: 5, suffix: '级' },
            { id: 'shakeAmount', name: '抖动幅度', type: 'range', min: 0, max: 20, step: 2, default: 6, suffix: 'px' },
            { id: 'warningText', name: '警示文字', type: 'text', default: '库存告急' },
            { id: 'bgColor', name: '背景颜色', type: 'color', default: '#000000' }
        ],
        
        init() {},
        
        render(ctx, progress, image, params, width, height) {
            const cx = width / 2;
            const cy = height / 2;
            const p = { ...this.paramsDefault(), ...params };
            const speed = p.blinkSpeed || 5;
            
            // 背景脉冲
            const bgPulse = Math.sin(progress * Math.PI * speed * 2) * 0.5 + 0.5;
            if (!p.transparent) {
                ctx.fillStyle = p.bgColor || '#000000';
                ctx.fillRect(0, 0, width, height);
            }
            
            // 红色脉冲覆盖层
            ctx.fillStyle = `rgba(218, 54, 51, ${bgPulse * 0.4})`;
            ctx.fillRect(0, 0, width, height);
            
            // 素材抖动
            const shake = p.shakeAmount || 6;
            const shakeX = Math.sin(progress * Math.PI * speed * 3) * shake * (1 - progress);
            const shakeY = Math.cos(progress * Math.PI * speed * 2.5) * shake * (1 - progress);
            
            // 素材闪烁
            const blink = Math.sin(progress * Math.PI * speed * 4) > 0 ? 1 : 0.3;
            ctx.globalAlpha = blink;
            
            const scale = 0.85 + easeOutQuad(clamp(progress * 1.5, 0, 1)) * 0.15;
            const fit = getFitSize(image, width, height);
            const imgW = fit.width * scale;
            const imgH = fit.height * scale;
            ctx.drawImage(image, cx - imgW/2 + shakeX, cy - imgH/2 + shakeY, imgW, imgH);
            
            // 警示文字
            ctx.globalAlpha = 1;
            const text = p.warningText || '库存告急';
            const fontSize = Math.min(width, height) * 0.12;
            ctx.font = `bold ${fontSize}px -apple-system, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // 文字描边
            ctx.strokeStyle = '#000';
            ctx.lineWidth = fontSize * 0.08;
            ctx.strokeText(text, cx, cy + imgH/2 + fontSize * 0.8);
            
            // 文字填充
            const textPulse = Math.sin(progress * Math.PI * 4) * 0.3 + 0.7;
            ctx.fillStyle = `rgba(255, 80, 80, ${textPulse})`;
            ctx.fillText(text, cx, cy + imgH/2 + fontSize * 0.8);
            
            ctx.globalAlpha = 1;
        },
        
        paramsDefault() {
            return { blinkSpeed: 5, shakeAmount: 6, warningText: '库存告急', bgColor: '#000000' };
        }
    },
    
    explosion: {
        id: 'explosion',
        name: '爆炸特效',
        description: '秒杀/大促开场，素材弹跳+彩纸爆炸',
        icon: '💥',
        params: [
            { id: 'particleCount', name: '爆炸粒子', type: 'range', min: 20, max: 200, step: 10, default: 80, suffix: '个' },
            { id: 'bounceHeight', name: '弹跳高度', type: 'range', min: 0, max: 100, step: 10, default: 40, suffix: '%' },
            { id: 'bgColor', name: '背景颜色', type: 'color', default: '#000000' }
        ],
        
        init(width, height, params) {
            this.system = new ParticleSystem(params.particleCount || 80, 99);
            this.system.particles.forEach((p, i) => {
                p.hue = seededRandom(i * 53) * 360; // 全色域
                p.size = 2 + seededRandom(i * 71) * 6;
                p.gravity = 0.5 + seededRandom(i * 47) * 1.5;
            });
            this.confetti = [];
            for (let i = 0; i < 30; i++) {
                this.confetti.push({
                    x: seededRandom(i * 113) * width,
                    y: -20 - seededRandom(i * 67) * 50,
                    w: 6 + seededRandom(i * 41) * 8,
                    h: 4 + seededRandom(i * 29) * 6,
                    hue: seededRandom(i * 83) * 360,
                    rot: seededRandom(i * 59) * Math.PI * 2,
                    rotSpeed: (seededRandom(i * 37) - 0.5) * 0.3,
                    fallSpeed: 2 + seededRandom(i * 23) * 4,
                    delay: seededRandom(i * 91) * 0.3
                });
            }
        },
        
        render(ctx, progress, image, params, width, height) {
            const cx = width / 2;
            const cy = height / 2;
            const p = { ...this.paramsDefault(), ...params };
            
            if (!p.transparent) {
                ctx.fillStyle = p.bgColor || '#000000';
                ctx.fillRect(0, 0, width, height);
            }
            
            // 爆炸粒子（后半段）
            if (progress > 0.15) {
                const expProgress = clamp((progress - 0.15) / 0.85, 0, 1);
                this.system.update(expProgress);
                const maxDist = Math.min(width, height) * 0.6;
                
                this.system.particles.forEach(pt => {
                    if (pt.alpha <= 0) return;
                    const px = cx + pt.x * maxDist;
                    const py = cy + pt.y * maxDist + expProgress * expProgress * 50; // 重力下落
                    ctx.globalAlpha = pt.alpha * 0.8;
                    ctx.fillStyle = `hsl(${pt.hue}, 90%, 60%)`;
                    ctx.beginPath();
                    ctx.arc(px, py, pt.size, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
            
            // 彩纸飘落
            this.confetti.forEach(cf => {
                if (progress < cf.delay) return;
                const cp = clamp((progress - cf.delay) / (1 - cf.delay), 0, 1);
                const cy_pos = cf.y + cp * height * 1.2;
                const cx_pos = cf.x + Math.sin(cp * Math.PI * 2) * 30;
                
                ctx.save();
                ctx.translate(cx_pos, cy_pos);
                ctx.rotate(cf.rot + cp * cf.rotSpeed * 10);
                ctx.globalAlpha = clamp(1 - cp * 0.5, 0, 1);
                ctx.fillStyle = `hsl(${cf.hue}, 85%, 55%)`;
                ctx.fillRect(-cf.w/2, -cf.h/2, cf.w, cf.h);
                ctx.restore();
            });
            
            // 素材弹跳
            ctx.globalAlpha = 1;
            const bounce = p.bounceHeight / 100;
            const bounceY = Math.sin(clamp(progress * 3, 0, Math.PI)) * height * bounce * 0.3;
            const scale = easeOutBack(clamp(progress * 1.5, 0, 1));
            const fit = getFitSize(image, width, height);
            const imgW = fit.width * scale;
            const imgH = fit.height * scale;
            const imgX = cx - imgW/2;
            const imgY = cy - imgH/2 - bounceY;
            
            ctx.drawImage(image, imgX, imgY, imgW, imgH);
        },
        
        paramsDefault() {
            return { particleCount: 80, bounceHeight: 40, bgColor: '#000000' };
        }
    },
    
    counter: {
        id: 'counter',
        name: '数字滚动',
        description: '价格揭晓/倒计时，数字滚动动画',
        icon: '🔢',
        params: [
            { id: 'startNum', name: '起始数字', type: 'number', min: 0, max: 99999, step: 1, default: 999 },
            { id: 'endNum', name: '目标数字', type: 'number', min: 0, max: 99999, step: 1, default: 99 },
            { id: 'prefix', name: '前缀文字', type: 'text', default: '¥' },
            { id: 'suffix', name: '后缀文字', type: 'text', default: '' },
            { id: 'bgColor', name: '背景颜色', type: 'color', default: '#000000' }
        ],
        
        init() {},
        
        render(ctx, progress, image, params, width, height) {
            const cx = width / 2;
            const cy = height / 2;
            const p = { ...this.paramsDefault(), ...params };
            
            if (!p.transparent) {
                ctx.fillStyle = p.bgColor || '#000000';
                ctx.fillRect(0, 0, width, height);
            }
            
            // 当前数字
            const eased = easeInOutCubic(progress);
            const currentNum = Math.round(p.startNum + (p.endNum - p.startNum) * eased);
            const displayText = `${p.prefix || ''}${currentNum}${p.suffix || ''}`;
            
            // 素材缩小放在上方
            const imgScale = 0.5 + (1 - eased) * 0.1;
            const fit = getFitSize(image, width, height);
            const imgW = fit.width * imgScale;
            const imgH = fit.height * imgScale;
            ctx.drawImage(image, cx - imgW/2, cy - imgH - 20, imgW, imgH);
            
            // 数字
            const fontSize = Math.min(width, height) * 0.22;
            ctx.font = `bold ${fontSize}px -apple-system, 'Segoe UI', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // 数字描边
            ctx.strokeStyle = '#000';
            ctx.lineWidth = fontSize * 0.06;
            ctx.strokeText(displayText, cx, cy + imgH/2);
            
            // 数字填充 - 从红到绿渐变
            const r = 255 - eased * 200;
            const g = 50 + eased * 150;
            const b = 50;
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillText(displayText, cx, cy + imgH/2);
            
            // 数字光晕
            if (progress > 0.8) {
                const glow = (progress - 0.8) / 0.2;
                ctx.shadowColor = `rgb(${r},${g},${b})`;
                ctx.shadowBlur = 20 * glow;
                ctx.fillText(displayText, cx, cy + imgH/2);
                ctx.shadowBlur = 0;
            }
            
            // 滚动条装饰
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(cx - width * 0.4, cy + imgH/2 + fontSize * 0.7, width * 0.8, 3);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(cx - width * 0.4, cy + imgH/2 + fontSize * 0.7, width * 0.8 * progress, 3);
        },
        
        paramsDefault() {
            return { startNum: 999, endNum: 99, prefix: '¥', suffix: '', bgColor: '#000000' };
        }
    }
};

// ===== 导出 =====
if (typeof window !== 'undefined') {
    window.EFFECTS = EFFECTS;
    window.easeOutElastic = easeOutElastic;
    window.easeOutBack = easeOutBack;
    window.easeOutQuad = easeOutQuad;
    window.easeInOutCubic = easeInOutCubic;
    window.clamp = clamp;
    window.drawStar = drawStar;
    window.drawSparkle = drawSparkle;
    window.seededRandom = seededRandom;
    window.ParticleSystem = ParticleSystem;
    window.getFitSize = getFitSize;
    window.getMultiSlideInfo = getMultiSlideInfo;
    window.roundRectPath = roundRectPath;
}

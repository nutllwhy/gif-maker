/**
 * 主应用逻辑 - 直播间动效GIF生成器
 */

(function() {
    'use strict';

    // ===== DOM 元素 =====
    const els = {
        uploadZone: document.getElementById('uploadZone'),
        fileInput: document.getElementById('fileInput'),
        materialList: document.getElementById('materialList'),
        templateList: document.getElementById('templateList'),
        canvas: document.getElementById('previewCanvas'),
        canvasOverlay: document.getElementById('canvasOverlay'),
        btnPlay: document.getElementById('btnPlay'),
        btnStop: document.getElementById('btnStop'),
        btnExport: document.getElementById('btnExport'),
        progressBar: document.getElementById('progressBar'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        canvasSize: document.getElementById('canvasSize'),
        duration: document.getElementById('duration'),
        durationValue: document.getElementById('durationValue'),
        fps: document.getElementById('fps'),
        fpsValue: document.getElementById('fpsValue'),
        loopCount: document.getElementById('loopCount'),
        effectParams: document.getElementById('effectParams')
    };

    const ctx = els.canvas.getContext('2d');

    // ===== 状态 =====
    const state = {
        materials: [],          // 上传的素材数组
        activeMaterial: null,   // 当前选中的素材
        activeEffect: 'shining',// 当前选中的特效
        isPlaying: false,       // 是否正在播放
        animationId: null,      // requestAnimationFrame ID
        effectInstances: {},    // 特效实例缓存
        baseParams: {           // 基础参数
            canvasSize: 400,
            duration: 2.0,
            fps: 15,
            loopCount: 0
        },
        effectParamValues: {}   // 各特效的参数值
    };

    // ===== 初始化 =====
    function init() {
        bindEvents();
        renderTemplates();
        selectEffect('shining');
        updateCanvasSize();
    }

    // ===== 事件绑定 =====
    function bindEvents() {
        // 文件上传
        els.fileInput.addEventListener('change', handleFileSelect);
        els.uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            els.uploadZone.classList.add('dragover');
        });
        els.uploadZone.addEventListener('dragleave', () => {
            els.uploadZone.classList.remove('dragover');
        });
        els.uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            els.uploadZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            for (let f of files) {
                if (f.type.startsWith('image/')) loadImage(f);
            }
        });

        // 播放控制
        els.btnPlay.addEventListener('click', togglePlay);
        els.btnStop.addEventListener('click', stopAnimation);
        els.btnExport.addEventListener('click', exportGIF);

        // 基础参数
        els.canvasSize.addEventListener('change', () => {
            state.baseParams.canvasSize = parseInt(els.canvasSize.value);
            updateCanvasSize();
            if (!state.isPlaying) renderPreview(0);
        });
        els.duration.addEventListener('input', () => {
            state.baseParams.duration = parseFloat(els.duration.value);
            els.durationValue.textContent = state.baseParams.duration.toFixed(1) + 's';
        });
        els.fps.addEventListener('input', () => {
            state.baseParams.fps = parseInt(els.fps.value);
            els.fpsValue.textContent = state.baseParams.fps + 'fps';
        });
        els.loopCount.addEventListener('change', () => {
            state.baseParams.loopCount = parseInt(els.loopCount.value);
        });
    }

    // ===== 素材管理 =====
    function handleFileSelect(e) {
        const files = e.target.files;
        for (let f of files) {
            if (f.type.startsWith('image/')) loadImage(f);
        }
        e.target.value = '';
    }

    function loadImage(file) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const material = {
                id: Date.now() + Math.random(),
                file: file,
                url: url,
                image: img,
                name: file.name
            };
            state.materials.push(material);
            if (!state.activeMaterial) {
                selectMaterial(material);
            }
            renderMaterialList();
        };
        img.src = url;
    }

    function selectMaterial(material) {
        state.activeMaterial = material;
        renderMaterialList();
        els.canvasOverlay.classList.add('hidden');
        if (!state.isPlaying) renderPreview(0);
    }

    function removeMaterial(id, e) {
        e.stopPropagation();
        const idx = state.materials.findIndex(m => m.id === id);
        if (idx >= 0) {
            URL.revokeObjectURL(state.materials[idx].url);
            state.materials.splice(idx, 1);
            if (state.activeMaterial && state.activeMaterial.id === id) {
                state.activeMaterial = state.materials[0] || null;
                if (!state.activeMaterial) {
                    els.canvasOverlay.classList.remove('hidden');
                    els.canvasOverlay.textContent = '请先上传图片素材';
                }
            }
            renderMaterialList();
            if (!state.isPlaying) renderPreview(0);
        }
    }

    function renderMaterialList() {
        els.materialList.innerHTML = '';
        if (state.materials.length === 0) {
            els.materialList.innerHTML = '<div style="color:#6e7681;font-size:12px;padding:8px 0;text-align:center;">暂无素材</div>';
            return;
        }
        state.materials.forEach(m => {
            const div = document.createElement('div');
            div.className = 'material-item' + (state.activeMaterial && state.activeMaterial.id === m.id ? ' active' : '');
            div.innerHTML = `
                <img src="${m.url}" alt="${m.name}">
                <div class="remove-btn" title="删除">×</div>
            `;
            div.addEventListener('click', () => selectMaterial(m));
            div.querySelector('.remove-btn').addEventListener('click', (e) => removeMaterial(m.id, e));
            els.materialList.appendChild(div);
        });
    }

    // ===== 模板管理 =====
    function renderTemplates() {
        els.templateList.innerHTML = '';
        Object.values(EFFECTS).forEach(effect => {
            const card = document.createElement('div');
            card.className = 'template-card' + (state.activeEffect === effect.id ? ' active' : '');
            card.dataset.id = effect.id;
            card.innerHTML = `
                <div class="template-icon">${effect.icon}</div>
                <div class="template-info">
                    <div class="template-name">${effect.name}</div>
                    <div class="template-desc">${effect.description}</div>
                </div>
                <div class="checkmark">✓</div>
            `;
            card.addEventListener('click', () => selectEffect(effect.id));
            els.templateList.appendChild(card);
        });
    }

    function selectEffect(effectId) {
        state.activeEffect = effectId;
        
        // 更新模板列表选中状态
        document.querySelectorAll('.template-card').forEach(card => {
            card.classList.toggle('active', card.dataset.id === effectId);
        });
        
        // 初始化特效
        initEffect(effectId);
        
        // 渲染参数面板
        renderEffectParams(effectId);
        
        if (!state.isPlaying) renderPreview(0);
    }

    function initEffect(effectId) {
        const effect = EFFECTS[effectId];
        if (!effect) return;
        
        const w = state.baseParams.canvasSize;
        const h = state.baseParams.canvasSize;
        const params = getEffectParams(effectId);
        
        // 清理旧实例
        if (state.effectInstances[effectId]) {
            state.effectInstances[effectId] = null;
        }
        
        // 创建新实例并初始化
        const instance = Object.create(effect);
        if (instance.init) {
            instance.init(w, h, params);
        }
        state.effectInstances[effectId] = instance;
    }

    function getEffectParams(effectId) {
        const effect = EFFECTS[effectId];
        if (!effect) return {};
        const defaults = effect.paramsDefault ? effect.paramsDefault() : {};
        const saved = state.effectParamValues[effectId] || {};
        return { ...defaults, ...saved };
    }

    function setEffectParam(effectId, paramId, value) {
        if (!state.effectParamValues[effectId]) {
            state.effectParamValues[effectId] = {};
        }
        state.effectParamValues[effectId][paramId] = value;
        
        // 重新初始化特效以应用新参数
        initEffect(effectId);
        
        if (!state.isPlaying) renderPreview(0);
    }

    function renderEffectParams(effectId) {
        const effect = EFFECTS[effectId];
        if (!effect || !effect.params) {
            els.effectParams.innerHTML = '<div style="color:#6e7681;font-size:12px;">该特效无需额外参数</div>';
            return;
        }
        
        els.effectParams.innerHTML = '';
        const currentValues = getEffectParams(effectId);
        
        effect.params.forEach(param => {
            const item = document.createElement('div');
            item.className = 'effect-param-item';
            
            let inputHtml = '';
            const val = currentValues[param.id] !== undefined ? currentValues[param.id] : param.default;
            
            switch (param.type) {
                case 'range':
                    inputHtml = `
                        <div class="param-row">
                            <input type="range" min="${param.min}" max="${param.max}" step="${param.step}" value="${val}" data-param="${param.id}">
                            <span class="param-value" data-param-value="${param.id}">${val}${param.suffix || ''}</span>
                        </div>
                    `;
                    break;
                case 'number':
                    inputHtml = `<input type="number" min="${param.min}" max="${param.max}" step="${param.step}" value="${val}" class="param-input" data-param="${param.id}">`;
                    break;
                case 'text':
                    inputHtml = `<input type="text" value="${val}" class="param-input" data-param="${param.id}">`;
                    break;
                case 'color':
                    inputHtml = `
                        <div class="param-row">
                            <div class="param-color">
                                <input type="color" value="${val}" data-param="${param.id}">
                            </div>
                            <span class="param-value" style="min-width:auto;">${val}</span>
                        </div>
                    `;
                    break;
            }
            
            item.innerHTML = `
                <label>${param.name}</label>
                ${inputHtml}
            `;
            els.effectParams.appendChild(item);
            
            // 绑定事件
            const input = item.querySelector('[data-param]');
            if (input) {
                const eventType = param.type === 'text' || param.type === 'number' ? 'input' : 'input';
                input.addEventListener(eventType, (e) => {
                    let value = e.target.value;
                    if (param.type === 'range' || param.type === 'number') {
                        value = parseFloat(value);
                    }
                    setEffectParam(effectId, param.id, value);
                    
                    // 更新显示值
                    const valueEl = item.querySelector(`[data-param-value="${param.id}"]`);
                    if (valueEl) valueEl.textContent = value + (param.suffix || '');
                    const colorTextEl = item.querySelector('.param-value');
                    if (param.type === 'color' && colorTextEl) colorTextEl.textContent = value;
                });
            }
        });
    }

    // ===== 画布渲染 =====
    function updateCanvasSize() {
        const size = state.baseParams.canvasSize;
        els.canvas.width = size;
        els.canvas.height = size;
    }

    function renderPreview(progress) {
        if (!state.activeMaterial) return;
        
        const effectId = state.activeEffect;
        const effect = state.effectInstances[effectId] || EFFECTS[effectId];
        if (!effect || !effect.render) return;
        
        const w = els.canvas.width;
        const h = els.canvas.height;
        const params = getEffectParams(effectId);
        
        ctx.clearRect(0, 0, w, h);
        effect.render(ctx, clamp(progress, 0, 1), state.activeMaterial.image, params, w, h);
    }

    // ===== 动画播放 =====
    function togglePlay() {
        if (state.isPlaying) {
            stopAnimation();
        } else {
            startAnimation();
        }
    }

    function startAnimation() {
        if (!state.activeMaterial) {
            alert('请先上传图片素材');
            return;
        }
        
        state.isPlaying = true;
        els.btnPlay.innerHTML = '⏸ 暂停';
        els.btnPlay.classList.remove('primary');
        els.btnPlay.classList.add('success');
        
        const duration = state.baseParams.duration * 1000;
        let startTime = null;
        
        function animate(timestamp) {
            if (!state.isPlaying) return;
            if (!startTime) startTime = timestamp;
            
            const elapsed = timestamp - startTime;
            const progress = (elapsed % duration) / duration;
            
            renderPreview(progress);
            
            state.animationId = requestAnimationFrame(animate);
        }
        
        state.animationId = requestAnimationFrame(animate);
    }

    function stopAnimation() {
        state.isPlaying = false;
        if (state.animationId) {
            cancelAnimationFrame(state.animationId);
            state.animationId = null;
        }
        els.btnPlay.innerHTML = '▶ 播放';
        els.btnPlay.classList.add('primary');
        els.btnPlay.classList.remove('success');
        renderPreview(0);
    }

    // ===== GIF 导出 =====
    function exportGIF() {
        if (!state.activeMaterial) {
            alert('请先上传图片素材');
            return;
        }
        
        stopAnimation();
        
        const w = state.baseParams.canvasSize;
        const h = state.baseParams.canvasSize;
        const fps = state.baseParams.fps;
        const duration = state.baseParams.duration;
        const totalFrames = Math.round(duration * fps);
        const delay = Math.round(1000 / fps);
        
        // 显示进度
        els.progressBar.style.display = 'flex';
        els.progressFill.style.width = '0%';
        els.progressText.textContent = '准备生成...';
        els.btnExport.disabled = true;
        document.body.classList.add('generating');
        
        // 使用 setTimeout 让UI更新后再开始生成
        setTimeout(() => {
            try {
                // 初始化特效（确保状态正确）
                initEffect(state.activeEffect);
                
                const gif = new GIF({
                    workers: 2,
                    quality: 10,
                    width: w,
                    height: h,
                    workerScript: 'lib/gif.worker.js'
                });
                
                // 创建临时 canvas 用于逐帧添加
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                const tempCtx = tempCanvas.getContext('2d');
                
                gif.on('progress', (p) => {
                    const percent = 50 + Math.round(p * 50);
                    els.progressFill.style.width = percent + '%';
                    els.progressText.textContent = `编码中... ${Math.round(p * 100)}%`;
                });
                
                gif.on('finished', (blob) => {
                    els.progressFill.style.width = '100%';
                    els.progressText.textContent = '导出完成!';
                    
                    // 下载文件
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `动效_${EFFECTS[state.activeEffect].name}_${Date.now()}.gif`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    
                    // 清理
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                        els.progressBar.style.display = 'none';
                        els.btnExport.disabled = false;
                        document.body.classList.remove('generating');
                        // 恢复预览
                        renderPreview(0);
                    }, 1000);
                });
                
                // 逐帧渲染并添加
                let frameIndex = 0;
                
                function addNextFrame() {
                    if (frameIndex >= totalFrames) {
                        els.progressText.textContent = '开始编码...';
                        gif.render();
                        return;
                    }
                    
                    const progress = frameIndex / totalFrames;
                    
                    // 在主 canvas 上渲染
                    renderPreview(progress);
                    
                    // 复制到临时 canvas
                    tempCtx.clearRect(0, 0, w, h);
                    tempCtx.drawImage(els.canvas, 0, 0);
                    
                    // 添加帧（使用 copy 避免引用问题）
                    gif.addFrame(tempCanvas, { copy: true, delay: delay });
                    
                    frameIndex++;
                    const percent = Math.round((frameIndex / totalFrames) * 50);
                    els.progressFill.style.width = percent + '%';
                    els.progressText.textContent = `渲染帧 ${frameIndex}/${totalFrames}...`;
                    
                    // 使用 setTimeout 让UI有更新机会，避免阻塞
                    setTimeout(addNextFrame, 0);
                }
                
                addNextFrame();
                
            } catch (err) {
                console.error('导出失败:', err);
                alert('导出失败: ' + err.message);
                els.progressBar.style.display = 'none';
                els.btnExport.disabled = false;
                document.body.classList.remove('generating');
                renderPreview(0);
            }
        }, 100);
    }

    // ===== 启动 =====
    init();
})();

// In-memory Circuit Breaker for OpenAI & Response Cache
let openaiCircuit = {
    isOpen: false,
    openUntil: 0,
    reason: ''
};

const responseCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 phút

export default async function handler(req, res) {
    // 1. CORS Security Hardening
    const origin = req.headers.origin || '';
    const allowedOrigins = [
        'https://peninsula-storyboard.vercel.app',
        'https://hue-heritage.vercel.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ];

    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const openAiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!openAiKey && !geminiKey) {
        return res.status(500).json({ error: 'Chưa cấu hình API Key cho ChatGPT hoặc Gemini trên server.' });
    }

    let { target, apartment, message, hook, duration, refScript = '', refVideo = '' } = req.body || {};

    if (!target || !message || !hook) {
        return res.status(400).json({ error: 'Thiếu các trường bắt buộc: target, message, hook' });
    }

    // 2. Input Sanitization & Length Guard (Chống Prompt Injection & Token Bloat)
    target = String(target).trim().slice(0, 500);
    apartment = String(apartment || 'Căn hộ Heritage 3 Phòng Ngủ').trim().slice(0, 100);
    message = String(message).trim().slice(0, 1000);
    hook = String(hook).trim().slice(0, 500);
    duration = String(duration || '45-60 giây').trim().slice(0, 50);
    refScript = String(refScript).trim().slice(0, 3000);
    refVideo = String(refVideo).trim().slice(0, 300);

    // 3. Response Cache Check (Tiết kiệm 100% Token cho request trùng lặp)
    const cacheKey = `${target}|${apartment}|${message}|${hook}|${duration}|${refScript.slice(0, 100)}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return res.status(200).json({
            result: cached.result,
            modelUsed: `${cached.modelUsed} (Bộ nhớ đệm tốc độ cao - 0 Token)`,
            engine: cached.engine,
            cached: true,
            candidates: [{ content: { parts: [{ text: cached.result }] } }]
        });
    }

    // SERVER-SIDE DATA & SYSTEM PROMPTS FOR HUE HERITAGE (GIAI ĐOẠN ĐỢT 3)
    const DATA_HUE_HERITAGE = 
        `DU AN: HUE HERITAGE (TP. Hue, Thua Thien Hue)
Chu dau tu: Cong ty Co phan Phat trien va Dau tu Dong Da. Don vi phan phoi doc quyen: Dat Xanh Mien Trung.
Vi tri: Mat tien duong Dong Da, Phuong Phu Nhuan, TP. Hue. Ket noi nhanh chong den song Huong tho mong (3 phut), Dai Noi (5 phut), Cau Trang Tien, Chua Thien Mu va quan the di san van hoa Hue.
Quy mo: 2 khoi thap bieu tuong cao 19 - 25 tang, 3 tang ham.
So luong san pham: 669 can ho cao cap (So huu lau dai).
Co cau dien tich CHINH XAC CHUAN CĐT:
  - Can ho Heritage 3 Phong Ngu: Dien tich tu 85m2 den 120.5m2 (Toi uu anh sang tu nhien, view song Huong sang trong).
  - Biet thu tren khong Sky Villa (Penthouse): Dien tich tu 138.6m2 den 289.1m2 (Thong tang sang trong, view Panorama toan canh Hue & Song Huong).
Tieu chuan ban giao: Full noi that cao cap mang dam tinh hoa van hoa Hue, op da tu nhien, kinh Low-E 27.5mm cach am can UV. Thiet bi ve sinh & bep cao cap nhap khau chau Au.
Gia ban: Tu 55 trieu dong/m2.

CHINH SACH BAN HANG ĐỢT 3:
  - Gio hang di san Đot 3: Quy can gioi han dot 3 voi nhieu vi tri dep.
  - Nhan dat cho uu tien (Booking): 50 trieu dong/suat (hoan phi 100% neu khong mua).
  - Chiet khau thanh toan nhanh: Dat muc tu 12% den 15%.
  - Ho tro vay von: Ngan hang cho vay 70%, 0% lai suat tu 18 den 24 thang.
  - Uu dai dac quyen: Mien phi quan ly van hanh 3 nam va the thanh vien Royal Heritage Club.

BOI CANH DỰ ÁN ĐỢT 3 & QUY TẮC QUAY DỰNG:
  - DỰ ÁN ĐANG Ở GIAI ĐOẠN ĐỢT 3: Mở bán giỏ hàng Đợt 3 với tệp căn hộ view sông Hương tuyệt đẹp.
  - THỰC TRẠNG DỰ ÁN: Dự án đang trong quá trình thi công xây dựng.
  - NGHÊM CẤM VI PHẠM AN TOÀN: Cấm tuyệt đối mô tả Host đứng giữa công trường, đi bộ trên/trong khu vực công trường đang thi công hoặc tiếp xúc với kết cấu công trình chưa hoàn thiện vì lý do an toàn lao động.
  - BỐI CẢNH QUAY THỰC TẾ THAY THẾ: Host quay tại bờ sông Hương, công viên ven sông, điểm nhìn toàn cảnh thành phố Huế, hoặc lồng ghép phối cảnh 3D Render kiến trúc tháp và không gian 3D nội thất.`;

    // 4. Single-Pass High-Efficiency Master Prompt (Gộp 2 bước thành 1 - Tiết kiệm 50% Token)
    const masterSystemPrompt = 
        `Ban la Giam doc Sang tao (Creative Director) kiem Chuyen gia Tam ly hoc HNWIs ve Bat Dong San Di San Sieu Sang tai Hue.\n\n` +
        `NHIỆM VỤ:\n` +
        `Từ thông tin chiến dịch, hãy viết BẢNG KỊCH BẢN STORYBOARD 4 GIAI ĐOẠN (5 đến 8 phân cảnh) cho GIAI ĐOẠN ĐỢT 3 của dự án bất động sản di sản Huế Heritage kề bên Sông Hương.\n\n` +
        `CẤU TRÚC 4 GIAI ĐOẠN BẮT BUỘC:\n` +
        `1. [GIAI ĐOẠN 1: HOOK & NỖI ĐẦU] [0:00 - 0:06]: Chạm vào tử huyệt cảm xúc (vinh quy bái tổ, di sản truyền đời gia tộc, bất động sản hữu hạn kề sông Hương), ngắt nhịp cuộn Meta (Pattern Interrupt).\n` +
        `2. [GIAI ĐOẠN 2: BỐI CẢNH & GIẢI PHÁP] [0:06 - 0:20]: Tâm điểm đường Đống Đa kề sông Hương, 5 phút đến Đại Nội, 2 khối tháp biểu tượng 19-25 tầng.\n` +
        `3. [GIAI ĐOẠN 3: CẢM XÚC SỞ HỮU & TÀI CHÍNH] [0:20 - 0:45]: Căn 3PN (85m2 - 120.5m2) hoặc Sky Villa (138.6m2 - 289.1m2), nội thất hoàng gia cao cấp, chiết khấu Đợt 3 đến 15%, 0% lãi suất 18-24 tháng, thẻ Royal Heritage Club.\n` +
        `4. [GIAI ĐOẠN 4: CẤP BÁCH & KÊU GỌI HÀNH ĐỘNG] [0:45 - Hết]: Giỏ hàng di sản Đợt 3 giới hạn, đặt chỗ ưu tiên 50 triệu (hoàn phí 100%), thúc đẩy Gọi Hotline/Đăng ký.\n\n` +
        `QUY TẮC AN TOÀN BỐI CẢNH BẮT BUỘC:\n` +
        `- Dự án đang thi công, CẤM TUYỆT ĐỐI cảnh Host đứng hay đi bộ trong công trường.\n` +
        `- Host quay tại bờ sông Hương, công viên ven sông, view Cố Đô kết hợp phối cảnh 3D Render tháp và không gian nội thất.\n` +
        `- DIỆN TÍCH CHUẨN: Căn hộ 3PN (85m2 - 120.5m2), Sky Villa (138.6m2 - 289.1m2).\n\n` +
        `YÊU CẦU ĐẦU RA JSON BẮT BUỘC:\n` +
        `Phải xuất kết quả dưới dạng JSON ARRAY gồm 5 đến 8 object. Mỗi object gồm đúng 6 trường:\n` +
        `{"stt": 1, "duration": "[0:00 - 0:06]", "message": "...", "visual": "...", "textOverlay": "...", "vo": "..."}\n` +
        `Chỉ trả về JSON hợp lệ, không giải thích thêm.`;

    let benchmarkInfo = "";
    if (refVideo || refScript) {
        benchmarkInfo = "\n\nMẪU THAM KHẢO HƯỚNG TỚI (BENCHMARK TARGET):\n";
        if (refVideo) benchmarkInfo += `- Link Video Mẫu: ${refVideo}\n`;
        if (refScript) benchmarkInfo += `- Kịch Bản Mẫu Tham Khảo:\n"""\n${refScript}\n"""\n`;
    }

    const userMessage = 
        `DỮ LIỆU DỰ ÁN:\n${DATA_HUE_HERITAGE}\n\n` +
        `<user_campaign_brief>\n` +
        `Loại sản phẩm: ${apartment}\n` +
        `Đối tượng mục tiêu: ${target}\n` +
        `Thông điệp chủ đạo: ${message}\n` +
        `Ý tưởng Hook: ${hook}\n` +
        `Thời lượng: ${duration}\n` +
        `${benchmarkInfo}` +
        `</user_campaign_brief>`;

    try {
        const { text, modelName, engine } = await callAIWithCascade(masterSystemPrompt, userMessage, geminiKey, openAiKey);

        // Lưu vào Cache
        responseCache.set(cacheKey, {
            result: text,
            modelUsed: modelName,
            engine: engine,
            timestamp: Date.now()
        });

        // Dọn dẹp cache cũ nếu vượt quá 100 entries
        if (responseCache.size > 100) {
            const oldestKey = responseCache.keys().next().value;
            responseCache.delete(oldestKey);
        }

        return res.status(200).json({ 
            result: text, 
            modelUsed: modelName,
            engine: engine,
            candidates: [{ content: { parts: [{ text: text }] } }] 
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function callAIWithCascade(systemPrompt, userMessage, geminiApiKey, openAiApiKey) {
    let lastError = null;

    // =========================================================================
    // TẦNG 1: THỬ CHATGPT (CÓ CIRCUIT BREAKER BẢO VỆ)
    // =========================================================================
    const now = Date.now();
    const isCircuitOpen = openaiCircuit.isOpen && now < openaiCircuit.openUntil;

    if (openAiApiKey && !isCircuitOpen) {
        const openAiModels = [
            { name: 'gpt-4o', label: 'OpenAI ChatGPT (GPT-4o Flagship)' },
            { name: 'o3-mini', label: 'OpenAI ChatGPT (o3-mini Reasoning)' },
            { name: 'gpt-4o-mini', label: 'OpenAI ChatGPT (GPT-4o Mini)' }
        ];

        for (const m of openAiModels) {
            try {
                const resText = await callOpenAISingle(systemPrompt, userMessage, openAiApiKey, m.name);
                return { text: resText, modelName: m.label, engine: 'openai' };
            } catch (err) {
                lastError = err;
                const errStr = String(err.message).toLowerCase();
                
                // Nếu hết tiền hoặc lỗi quota -> Kích hoạt Circuit Breaker trong 10 phút để ngắt lặp lỗi
                if (errStr.includes('quota') || errStr.includes('credit') || errStr.includes('balance') || errStr.includes('429')) {
                    openaiCircuit.isOpen = true;
                    openaiCircuit.openUntil = Date.now() + 10 * 60 * 1000;
                    openaiCircuit.reason = err.message;
                    console.warn(`[Circuit Breaker Bật] OpenAI hết credits/quota. Tự động chuyển thẳng sang Gemini trong 10 phút.`);
                    break; // Dừng thử các model OpenAI khác ngay lập tức, nhảy sang Gemini
                }
            }
        }
    }

    // =========================================================================
    // TẦNG 2: TỰ ĐỘNG CHUYỂN SANG GOOGLE GEMINI (STRICT JSON MODE)
    // =========================================================================
    if (geminiApiKey) {
        const geminiModels = [
            { name: 'gemini-3.7-flash', thinkingBudget: 4096, label: 'Google Gemini 3.7 Flash (High Reasoning)' },
            { name: 'gemini-3.6-flash', thinkingBudget: 0, label: 'Google Gemini 3.6 Flash' }
        ];

        for (const m of geminiModels) {
            try {
                const resText = await callGeminiSingle(systemPrompt, userMessage, geminiApiKey, m.name, m.thinkingBudget);
                const tag = (openAiApiKey && isCircuitOpen) 
                    ? `${m.label} (Fallback tự động khi ChatGPT hết Credits)` 
                    : m.label;
                return { text: resText, modelName: tag, engine: 'gemini' };
            } catch (err) {
                console.warn(`[Gemini] Model ${m.name} gặp lỗi: ${err.message}.`);
                lastError = err;
            }
        }
    }

    throw new Error(`Tất cả các mô hình AI đều không thể xử lý: ${lastError ? lastError.message : 'Unknown error'}`);
}

async function callOpenAISingle(systemPrompt, userMessage, apiKey, model) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userMessage });

    const payload = {
        model: model,
        messages: messages,
        temperature: 0.85
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        throw new Error('OpenAI không trả về nội dung văn bản hợp lệ.');
    }
    return data.choices[0].message.content;
}

async function callGeminiSingle(systemPrompt, userMessage, apiKey, model, thinkingBudget = 0) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    
    const genConfig = { 
        temperature: 0.85, 
        maxOutputTokens: 16384,
        responseMimeType: "application/json" // Strict JSON Mode
    };
    if (thinkingBudget > 0 && model.includes('3.7')) {
        genConfig.thinkingConfig = { thinkingBudget: thinkingBudget };
    }

    const payload = {
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: genConfig
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini HTTP ${response.status}: ${text}`);
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Mô hình AI không trả về kết quả hợp lệ.');
    }
    const parts = data.candidates[0].content.parts;
    for (let p = 0; p < parts.length; p++) {
        if (parts[p].text && !parts[p].thought) return parts[p].text;
    }
    for (let q = parts.length - 1; q >= 0; q--) {
        if (parts[q].text) return parts[q].text;
    }
    throw new Error('Không tìm thấy nội dung văn bản trong response.');
}

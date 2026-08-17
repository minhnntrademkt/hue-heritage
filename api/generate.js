export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on server.' });
    }

    const { target, apartment, message, hook, duration, model = 'gemini-3.6-flash', refScript = '', refVideo = '', systemInstruction, userMessage } = req.body;

    // Direct call fallback if explicitly passing systemInstruction & userMessage
    if (systemInstruction && userMessage) {
        try {
            const rawText = await callGeminiSingle(systemInstruction, userMessage, apiKey, model);
            return res.status(200).json({ result: rawText, candidates: [{ content: { parts: [{ text: rawText }] } }] });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    }

    if (!target || !message || !hook) {
        return res.status(400).json({ error: 'Missing required fields: target, message, hook' });
    }

    // SERVER-SIDE HIDDEN DATA & SYSTEM PROMPTS FOR HUE HERITAGE
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

CHINH SACH BAN HANG DU KIEN:
  - Nhan dat cho uu tien (Booking): 50 trieu dong/suat (hoan phi 100% neu khong mua).
  - Chiet khau thanh toan nhanh: Dat muc tu 12% den 15%.
  - Ho tro vay von: Ngan hang cho vay 70%, 0% lai suat tu 18 den 24 thang.
  - Uu dai dac quyen: Mien phi quan ly van hanh 3 nam va the thanh vien Royal Heritage Club.

BOI CANH DỰ ÁN & QUY TẮC QUAY DỰNG (RẤT QUAN TRỌNG):
  - THỰC TRẠNG DỰ ÁN: Dự án đang trong quá trình thi công xây dựng.
  - NGHÊM CẤM VI PHẠM AN TOÀN: Cấm tuyệt đối mô tả Host đứng giữa công trường, đi bộ trên/trong khu vực công trường đang thi công hoặc tiếp xúc với kết cấu công trình chưa hoàn thiện vì lý do an toàn lao động.
  - BỐI CẢNH QUAY THỰC TẾ THAY THẾ: Host quay tại bờ sông Hương, công viên ven sông, điểm nhìn toàn cảnh thành phố Huế, hoặc lồng ghép phối cảnh 3D Render kiến trúc tháp và không gian 3D nội thất.
  - THẺ GHI CHÚ BẮT BUỘC: Khi có cảnh 3D Render hoặc lồng ghép AI, bắt buộc chèn ghi chú "(Hình ảnh minh họa có sử dụng công nghệ AI)".`;

    const RULE_COMPLIANCE = 
        `\n\nQUY ĐỊNH TUÂN THỦ TRUYỀN THÔNG & AN TOÀN BẮT BUỘC:
1. TUYỆT ĐỐI CẤM CẢNH QUAY CÔNG TRƯỜNG NGUY HIỂM: Không cho Host đứng giữa công trường đang thi công, không đi bộ trên/trong khu vực công trình chưa hoàn thiện. Thay vào đó, Host quay tại bờ sông Hương, công viên ven sông hoặc lồng ghép phối cảnh 3D Render.
2. NGHÊM CẤM TỪ HẠ GIÁ / PHÁ GIÁ: Không dùng "Giá chỉ còn", "giá sau chiết khấu", "giá net", "giá đáy", "giá sốc", "giá sập sàn", "cắt lỗ".
3. NGHÊM CẤM TỪ SUẤT RIÊNG / ẢO: Không dùng "Suất nội bộ", "suất ngoại giao", "suất Chủ đầu tư", "chiết khấu riêng".
4. NGHÊM CẤM CAM KẾT LỢI NHUẬN / RỦI RO: Không dùng "Chắc chắn tăng giá", "cam kết tăng giá", "mua là lời", "không rủi ro". (Chỉ dùng: "Tiềm năng gia tăng giá trị").
5. BẮT BUỘC THÊM THẺ GHI CHÚ 3D/AI: Trong các phân cảnh visual có hiệu ứng 3D render hoặc AI, bắt buộc chèn dòng chữ "(Hình ảnh minh họa có sử dụng công nghệ AI)" trong textOverlay hoặc visual.`;

    const sysAssistant1 = 
        "Ban la Senior Copywriter va chuyen gia tam ly hoc hanh vi khach hang cao cap (HNWIs) tai Viet Nam.\n\n" +
        "NHIEM VU CHINH:\n" +
        "Dựa vào Target doi tuong, hãy viết PROMPT chiến lược cho dự án bất động sản di sản Huế Heritage kề bên Sông Hương.\n" +
        "- Phải tạo ra các Hook (0-3s) đánh trúng tử huyệt tâm lý (vinh quy bái tổ, di sản truyền đời, vinh hoa gia tộc...).\n" +
        "- LƯU Ý BỐI CẢNH: Dự án đang thi công, CẤM cảnh Host đứng/đi bộ trong công trường. Hướng dẫn quay Host tại bờ sông Hương / công viên ven sông / lồng ghép 3D render.\n" +
        "- Sử dụng chính xác diện tích: Căn hộ 3PN (85m2 - 120.5m2), Sky Villa (138.6m2 - 289.1m2)." +
        RULE_COMPLIANCE + "\n\nChỉ trả về đoạn prompt chiến lược bằng tiếng Việt.";

    const sysCreator = 
        "Ban la Creative Director va Chuyen gia Viet Ad Copy Biet Thu & Bat Dong San Sieu Sang Viet Nam.\n\n" +
        "KHUNG HƯỚNG DẪN MARKETING 4 GIAI ĐOẠN (ĐỊNH HƯỚNG CHIẾN LƯỢC FOR HUE HERITAGE):\n" +
        "1. [GIAI ĐOẠN 1: HOOK & NỖI ĐẦU] (Mốc [0:00 - 0:06]): Chạm vào nỗi đau/sự tò mò của KH (áp lực tài chính, vinh quy bái tổ, di sản truyền đời). Hook 0-3s cực mạnh để ngắt nhịp cuộn Meta (Pattern Interrupt).\n" +
        "2. [GIAI ĐOẠN 2: BỐI CẢNH & GIẢI PHÁP] (Mốc [0:06 - 0:20]): Giúp KH hình dung cuộc sống lý tưởng: vị trí kề Sông Hương, không gian thư giãn, tiện ích Cố Đô như giải pháp hoàn hảo cho Cảnh 1.\n" +
        "3. [GIAI ĐOẠN 3: CẢM XÚC SỞ HỮU & TÀI CHÍNH] (Mốc [0:20 - 0:45]): Đánh mạnh cảm xúc mong muốn sở hữu gia sản truyền đời, an tâm tài chính, chính sách 0% lãi suất, đặc quyền Royal Heritage Club.\n" +
        "4. [GIAI ĐOẠN 4: CẤP BÁCH & KÊU GỌI HÀNH ĐỘNG] (Mốc [0:45 - Hết]): Tạo cảm giác cấp bách, giỏ hàng di sản giới hạn, ưu đãi đợt 1, thúc đẩy Đăng ký/Gọi Hotline ngay.\n\n" +
        "YÊU CẦU QUAY DỰNG BẮT BUỘC:\n" +
        "- KHÔNG CÓ CẢNH HOST TRONG CÔNG TRƯỜNG: Dự án đang thi công, cấm Host đứng hay đi bộ trong công trường. Quay Host tại bờ sông Hương, công viên ven sông, view thành phố Huế kết hợp 3D Render.\n" +
        "- DIỆN TÍCH CHÍNH XÁC: Căn hộ 3PN (85m2 - 120.5m2), Sky Villa (138.6m2 - 289.1m2).\n" +
        "- TỐI ƯU THUẬT TOÁN META ADS: 5 đến 8 cảnh phân phối dồn dập, Text Overlay ngắn gọn nổi bật dành cho người xem tắt tiếng (Sound-off viewers), Host người thật dẫn dắt sinh động." +
        RULE_COMPLIANCE + "\n\nYÊU CẦU ĐẦU RA: Xuất ĐÚNG MỘT JSON ARRAY [] gồm 5-8 phân cảnh. Mỗi phân cảnh có 6 trường:\n" +
        "  'stt' (số nguyên 1, 2, 3, 4...), 'duration' (VD: '5 giây', '10 giây'...), 'message', 'visual', 'textOverlay', 'vo'.\n" +
        "Tuyệt đối chỉ trả về JSON thuần [ ... ]. Không dùng markdown, không thông tin ngoài JSON.";

    let benchmarkInfo = "";
    if (refVideo || refScript) {
        benchmarkInfo = "\n\nMẪU THAM KHẢO HƯỚNG TỚI (BENCHMARK TARGET):\n";
        if (refVideo) benchmarkInfo += `- Link Video Mẫu: ${refVideo}\n`;
        if (refScript) benchmarkInfo += `- Kịch Bản Mẫu Tham Khảo:\n"""\n${refScript}\n"""\n`;
        benchmarkInfo += "(Hãy học theo tông giọng, phong cách dẫn của Host và nhịp điệu Hook từ Mẫu Tham Khảo trên khi tạo kịch bản mới!).\n";
    }

    const csbhCanho = "Chính sách Huế Heritage: Booking 50 triệu (hoàn phí 100%), CK đợt 1 đến 15% thanh toán nhanh, 0% lãi suất vay 70% từ 18-24 tháng, tặng thẻ Royal Heritage Club.";
    const userMsg1 = `BO DU LIEU DU AN:\n${DATA_HUE_HERITAGE}\n\nCHIEN DICH CAN VIET KICH BAN:\nLoai san pham: ${apartment}\nCSBH: ${csbhCanho}\nTarget doi tuong: ${target}\nThong diep: ${message}\nHook: ${hook}\nThoi luong: ${duration}${benchmarkInfo}`;

    try {
        // Step 1: Strategic prompt creation
        const promptChuan = await callGeminiSingle(sysAssistant1, userMsg1, apiKey, model);

        // Step 2: Storyboard generation
        const userMsg2 = `BO DU LIEU DU AN:\n${DATA_HUE_HERITAGE}\n\nPROMPT CHIEN LUOC TU ASSIST ASSISTANT 1:\n${promptChuan}${benchmarkInfo}`;
        const jsonRaw = await callGeminiSingle(sysCreator, userMsg2, apiKey, model);

        return res.status(200).json({ result: jsonRaw, candidates: [{ content: { parts: [{ text: jsonRaw }] } }] });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

async function callGeminiSingle(systemPrompt, userMessage, apiKey, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const payload = {
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 16384 }
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
        throw new Error(`HTTP ${response.status}: ${text}`);
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

const GEMINI_RETRYABLE_STATUS = new Set([
  408,
  500,
  502,
  503,
  504
]);

const GEMINI_MAX_RETRIES = 1;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const query = String(body.query || "").trim();

const systemPrompt =
  "你是一位專業的台灣職業安全衛生管理師、安全作業標準程序撰寫人員及風險控制專家。";

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "缺少 GEMINI_API_KEY，請到 Vercel Environment Variables 設定"
      });
    }

    if (!query) {
      return res.status(400).json({
        error: "缺少 query",
        receivedBody: body
      });
    }

const prompt = `
請根據以下作業名稱，產生可供職業安全衛生管理人員初步審查使用的安全衛生作業標準程序。

作業名稱：${query}

請依下列原則進行判斷與撰寫：

1. 請先判斷此作業通常涉及的實際作業流程、設備、工具、作業環境、主要危害來源及可能事故型態，再依合理的作業順序建立標準程序。

2. 不得僅依作業名稱套用通用模板。每一個工作步驟都必須依該步驟本身重新判斷：
   - 實際工作方法 desc
   - 不安全因素 danger
   - 安全措施 safety
   - 事故處理 emergency

3. step 與 desc 應依實際作業流程排列。原則上應涵蓋必要的：
   - 作業前確認
   - 作業環境與設備檢查
   - 作業準備
   - 正式作業
   - 異常或緊急處置
   - 作業結束、復原及整理
   但必須依實際作業內容調整，不得機械式增加不適用的步驟。

4. danger 必須具體描述該工作步驟可能存在的危害來源與事故型態，例如：
   - 墜落
   - 感電
   - 夾捲
   - 切割
   - 撞擊
   - 物體飛落
   - 倒塌或崩塌
   - 車輛碰撞
   - 火災爆炸
   - 化學品暴露
   - 缺氧
   - 高溫
   - 噪音
   - 滑倒
   - 肌肉骨骼傷害
   - 其他與該作業直接相關的職業安全衛生危害

   不得只寫「注意安全」、「具有風險」、「可能發生事故」等過度空泛內容。

5. safety 必須直接對應該筆 danger，並優先依風險控制層級思考：
   - 消除危害
   - 替代
   - 工程控制
   - 隔離或防護裝置
   - 作業程序與管理控制
   - 教育訓練
   - 個人防護具

   不得把個人防護具作為所有危害的唯一控制方式，也不得每個步驟重複相同安全措施。

6. emergency 必須針對該步驟實際可能發生的事故型態提出具體處置，例如：
   - 立即停止作業
   - 停止設備
   - 切斷能源
   - 隔離危險區域
   - 通報現場主管
   - 實施急救
   - 啟動消防應變
   - 緊急撤離
   - 依現場緊急應變程序處置

   不得每一筆都只寫「立即通報主管」。

7. tools 必須列出與此作業合理且直接相關的工具、機械、設備或器具，不得自行加入與作業無關的設備。

8. protective 必須依實際危害選擇適當個人防護具，例如安全帽、安全鞋、防護手套、防護眼鏡、面罩、呼吸防護具、安全帶或聽力防護具等。
   不得無差別列出所有防護具，也不得在沒有對應危害時自行增加特殊防護裝備。

9. type、method、name 必須與使用者輸入的作業名稱及產生的實際程序一致，不得產生彼此矛盾的作業種類或作業方法。

10. 內容應以台灣職業安全衛生實務及相關法規要求作為主要參考方向，包括但不限於：
    - 職業安全衛生法
    - 職業安全衛生法施行細則
    - 職業安全衛生設施規則
    - 營造安全衛生設施標準
    - 職業安全衛生管理辦法
    - 職業安全衛生教育訓練規則
    - 危害性化學品標示及通識規則
    - 危險性機械及設備安全檢查規則
    - 機械設備器具安全標準
    - 其他與該作業直接相關之職業安全衛生規範

11. 本次 JSON 不需另外輸出法規名稱或法規條號。
    若無法高度確認特定法規條號、設備規格、法定數值、距離、高度、濃度、壓力、承載能力或其他技術條件，不得自行捏造或猜測。

12. 若某項要求會依設備型號、製造商規範、作業場所、現場環境或風險評估結果而異，應使用較保守且合理的描述，例如：
    - 依設備製造商操作規範辦理
    - 依現場風險評估結果採取適當防護措施
    - 確認設備及防護裝置符合相關安全規定
    不得自行杜撰精確技術數值。

13. 若使用者僅輸入簡短作業名稱，而無法確認特定設備型號、施工方式、化學品種類或特殊作業環境，請以一般合理且安全的標準作業情境撰寫，不得假設不存在的特殊條件。

14. 各工作步驟之 danger、safety、emergency 必須互相對應。
    不得出現某工作步驟描述機械作業，但 danger 卻是無關的化學暴露，或 safety、emergency 與實際危害無直接關聯的情況。

15. 避免不同工作步驟大量重複完全相同的 danger、safety 或 emergency。
    若不同步驟確實存在相同危害，可以使用相同控制原則，但內容仍應依該步驟實際情境調整。

16. 內容必須使用正式、清楚、可執行的安全作業標準程序語氣，避免過度口語、模糊或空泛敘述。

17. 完成全部內容後，請在輸出 JSON 前自行重新核對：
    - 作業流程是否合理完整
    - 是否遺漏重要作業階段
    - 每一個危害是否與該步驟直接相關
    - 安全措施是否能實際控制該危害
    - 事故處理是否符合可能事故型態
    - 工具設備是否與作業相符
    - 個人防護具是否與危害相符
    - 是否出現不合理重複內容
    - 是否有過度推測
    - 是否有虛構法規、設備規格或技術數值

請只輸出符合指定 JSON Schema 的內容，不要 markdown、不要說明文字，也不要在 JSON 前後加入其他文字。
`;

const payload = {

  /*
   * 專業角色與最高層級原則。
   */
  systemInstruction: {
    parts: [
      {
        text: systemPrompt
      }
    ]
  },


  /*
   * 使用者實際作業名稱與 17 點職安判斷規則。
   */
  contents: [
    {
      role: "user",
      parts: [
        {
          text: prompt
        }
      ]
    }
  ],


  generationConfig: {

    /*
     * 維持目前已確認的生成穩定度。
     */
    temperature: 0.4,


    /*
     * 強制輸出 JSON。
     */
    responseMimeType: "application/json",


    /*
     * 固定程序書 JSON 結構。
     *
     * 內容品質仍由前面的 17 點
     * 職安判斷規則負責；
     * 這裡只負責格式。
     */
    responseSchema: {

      type: "OBJECT",

      properties: {

        type: {
          type: "STRING"
        },

        method: {
          type: "STRING"
        },

        name: {
          type: "STRING"
        },

        tools: {
          type: "STRING"
        },

        protective: {
          type: "STRING"
        },

        steps: {

          type: "ARRAY",

          items: {

            type: "OBJECT",

            properties: {

              step: {
                type: "STRING"
              },

              desc: {
                type: "STRING"
              },

              danger: {
                type: "STRING"
              },

              safety: {
                type: "STRING"
              },

              emergency: {
                type: "STRING"
              }

            },

            required: [
              "step",
              "desc",
              "danger",
              "safety",
              "emergency"
            ]
          }
        }
      },

      required: [
        "type",
        "method",
        "name",
        "tools",
        "protective",
        "steps"
      ]
    }
  }
};

let response = null;
let data = null;
let finalAttempt = 0;

for (
  let attempt = 0;
  attempt <= GEMINI_MAX_RETRIES;
  attempt += 1
) {
  finalAttempt = attempt + 1;

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    data = await response.json();

  } catch (fetchError) {

    /*
     * 網路層暫時失敗：
     * 第一次失敗時允許自動重試一次。
     */
    if (attempt < GEMINI_MAX_RETRIES) {

      const delay =
        1000 +
        Math.floor(
          Math.random() * 500
        );

      console.warn(
        `Gemini network error，${delay}ms 後進行第 1 次重試：`,
        fetchError
      );

      await wait(delay);

      continue;
    }

    throw fetchError;
  }


  /*
   * 成功：
   * 直接離開 Retry 迴圈。
   */
  if (response.ok) {
    break;
  }


  /*
   * 只針對暫時性伺服器錯誤進行重試。
   *
   * 429 不在此清單內，
   * 避免真正遇到配額或速率限制時
   * 持續增加 API 請求。
   */
  const shouldRetry =
    GEMINI_RETRYABLE_STATUS.has(
      response.status
    ) &&
    attempt < GEMINI_MAX_RETRIES;


  if (!shouldRetry) {
    break;
  }


  /*
   * 第一次遇到暫時性錯誤，
   * 等待約 1～1.5 秒後只再試一次。
   */
  const delay =
    1000 +
    Math.floor(
      Math.random() * 500
    );

  console.warn(
    `Gemini 暫時性錯誤 HTTP ${response.status}，${delay}ms 後進行第 1 次重試。`
  );

  await wait(delay);
}


/*
 * Retry 結束後仍失敗，
 * 維持原本的錯誤回傳方式。
 */
if (!response || !response.ok) {

  console.error(
    "Gemini API Error:",
    JSON.stringify(
      data,
      null,
      2
    )
  );

return res
  .status(
    response?.status || 500
  )
  .json({
    error:
      data?.error ||
      data ||
      "Gemini API 呼叫失敗"
  });
}


/*
 * Gemini 回傳的 Token 使用資訊。
 *
 * 這只是讀取原本 Response 內已有的資料，
 * 不會再呼叫任何 Gemini API。
 */
if (data?.usageMetadata) {

  console.log(
    "Gemini usage:",
    {
      attemptCount:
        finalAttempt,

      promptTokenCount:
        data.usageMetadata
          .promptTokenCount ?? 0,

      candidatesTokenCount:
        data.usageMetadata
          .candidatesTokenCount ?? 0,

      totalTokenCount:
        data.usageMetadata
          .totalTokenCount ?? 0
    }
  );
}


return res
  .status(200)
  .json(data);
  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({
      error: error.message
    });
  }
}

/* =========================================================
   Gemini API 基本設定
========================================================= */

const GEMINI_MODEL =
  "gemini-2.5-flash-lite";


/*
 * 僅針對暫時性錯誤 Retry。
 *
 * 刻意不將 429 放入：
 * 避免真正遇到額度／Rate Limit 時，
 * 又立即增加額外 API 呼叫。
 */
const GEMINI_RETRYABLE_STATUS =
  new Set([
    408,
    500,
    502,
    503,
    504
  ]);


/*
 * 最多只重試一次。
 *
 * 正常成功：
 * 1 次 API
 *
 * 暫時失敗：
 * 最多 2 次 API
 */
const GEMINI_MAX_RETRIES = 1;


/*
 * Retry 等待。
 */
function wait(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}


/*
 * 安全讀取 Gemini Response。
 *
 * 正常 Gemini 回傳 JSON；
 * 若上游服務極少數情況回傳非 JSON，
 * 也避免 response.json() 直接拋錯。
 */
async function readGeminiResponse(
  response
) {

  const text =
    await response.text();


  if (!text) {
    return {};
  }


  try {

    return JSON.parse(
      text
    );

  } catch (_) {

    return {
      error: {
        message:
          text
      }
    };
  }
}


/* =========================================================
   API Handler
========================================================= */

export default async function handler(
  req,
  res
) {

  /*
   * 僅接受 POST。
   */
  if (
    req.method !==
    "POST"
  ) {

    return res
      .status(405)
      .json({
        error:
          "Method not allowed"
      });
  }


  try {

    /* =====================================================
       讀取前端資料
    ===================================================== */

    const body =
      typeof req.body ===
        "string"
        ? JSON.parse(
            req.body || "{}"
          )
        : req.body || {};


    const query =
      String(
        body.query || ""
      ).trim();


    /*
     * API Key 檢查。
     */
    if (
      !process.env
        .GEMINI_API_KEY
    ) {

      return res
        .status(500)
        .json({
          error:
            "缺少 GEMINI_API_KEY，請到 Vercel Environment Variables 設定"
        });
    }


    /*
     * 作業名稱檢查。
     */
    if (!query) {

      return res
        .status(400)
        .json({
          error:
            "缺少 query"
        });
    }


    /* =====================================================
       System Prompt

       保留原本專業角色設定。
    ===================================================== */

    const systemPrompt = `
你是一位專業的台灣職業安全衛生管理師、安全作業標準程序撰寫人員及風險控制專家。

你的任務是依台灣職業安全衛生實務，產生可供職業安全衛生管理人員初步審查的安全作業標準程序。

內容必須專業、具體、可執行，並避免虛構法規、設備規格、技術數值或不存在的作業條件。
`.trim();


    /* =====================================================
       精簡後 User Prompt

       保留原本 17 點規則的核心要求，
       移除重複描述與 JSON 範本。
    ===================================================== */

    const prompt = `
作業名稱：${query}

請依下列要求建立安全衛生作業標準程序：

1. 先判斷此作業通常涉及的實際流程、設備、工具、作業環境、主要危害及可能事故，再依合理順序建立工作步驟。不得僅依作業名稱套用通用模板。

2. 工作流程應依實際需要涵蓋作業前確認、環境與設備檢查、作業準備、正式作業、異常或緊急處置，以及作業結束與復原整理；不適用的階段不得為湊數而加入。

3. 每一工作步驟都必須獨立判斷：
- step：工作步驟
- desc：實際工作方法
- danger：該步驟直接相關的危害來源及可能事故
- safety：直接控制該 danger 的安全措施
- emergency：該事故真正發生時的具體應變處置

danger、safety、emergency 必須互相對應，不得出現與該工作步驟無關的危害或控制措施。

4. danger 必須具體描述實際危害，例如墜落、感電、夾捲、切割、撞擊、物體飛落、倒塌、車輛碰撞、火災爆炸、化學品暴露、缺氧、高溫、噪音、滑倒、肌肉骨骼傷害或其他與作業直接相關的危害。不得只寫「注意安全」、「具有風險」或「可能發生事故」。

5. safety 應優先依風險控制層級思考：消除、替代、工程控制、隔離或防護裝置、管理與作業程序、教育訓練、個人防護具。不得把 PPE 當成所有危害的唯一控制方式。

6. emergency 應依實際事故型態提出可執行處置，例如停止作業、停止設備、切斷能源、隔離危險區、通報主管、急救、消防應變或緊急撤離。不得每一步都只寫「立即通報主管」。

7. tools 僅列出與此作業直接相關的機械、設備、工具或器具；protective 僅依實際危害選擇需要的個人防護具，不得無差別羅列。

8. type、method、name 必須與作業名稱及實際程序一致，不得彼此矛盾。

9. 內容以台灣職業安全衛生實務及直接相關法規要求為主要判斷方向，包括職業安全衛生法及其相關子法、設施規則、營造安全衛生規範、管理與教育訓練規範、危害性化學品、危險性機械設備及機械設備器具等相關安全規定。

10. 無法高度確認法規條號、設備規格、法定數值、距離、高度、濃度、壓力、承載能力或其他技術條件時，不得自行猜測或捏造。應改用「依設備製造商規範」、「依現場風險評估結果」或「確認符合相關安全規定」等合理描述。

11. 若作業名稱資訊不足，請採一般合理且安全的標準作業情境，不得自行假設特定設備型號、施工方式、化學品種類或特殊作業環境。

12. 不同工作步驟應避免大量重複完全相同的 danger、safety 或 emergency；相同危害可以採相同控制原則，但內容須依各步驟實際情境調整。

13. 使用正式、清楚、可執行的安全作業標準程序語氣。

輸出前請自行確認：
- 作業流程合理完整
- 無重要階段遺漏
- 危害與工作步驟直接相關
- 安全措施可以控制對應危害
- 事故處理符合可能事故型態
- 工具設備及防護具與作業相符
- 無不合理重複
- 無過度推測
- 無虛構法規、規格或技術數值

只輸出符合指定 JSON Schema 的內容，不要輸出 Markdown 或額外說明。
`.trim();


    /* =====================================================
       Gemini Payload
    ===================================================== */

    const payload = {

      /*
       * 將角色設定獨立放在 systemInstruction，
       * 不再混入一般使用者 Prompt。
       */
      systemInstruction: {
        parts: [
          {
            text:
              systemPrompt
          }
        ]
      },


      contents: [
        {
          role:
            "user",

          parts: [
            {
              text:
                prompt
            }
          ]
        }
      ],


      generationConfig: {

        /*
         * 維持原本 0.4，
         * 不改目前已確認的生成風格。
         */
        temperature:
          0.4,


        /*
         * 限制異常過長的輸出，
         * 一般 SOP 足以使用。
         */
        maxOutputTokens:
          4096,


        /*
         * 要求 Gemini 回傳 JSON。
         */
        responseMimeType:
          "application/json",


        /*
         * Gemini 原生 Structured Output。
         *
         * 不再需要把完整 JSON 範本
         * 重複寫進 Prompt。
         */
        responseSchema: {

          type:
            "OBJECT",

          properties: {

            type: {
              type:
                "STRING"
            },

            method: {
              type:
                "STRING"
            },

            name: {
              type:
                "STRING"
            },

            tools: {
              type:
                "STRING"
            },

            protective: {
              type:
                "STRING"
            },

            steps: {

              type:
                "ARRAY",

              items: {

                type:
                  "OBJECT",

                properties: {

                  step: {
                    type:
                      "STRING"
                  },

                  desc: {
                    type:
                      "STRING"
                  },

                  danger: {
                    type:
                      "STRING"
                  },

                  safety: {
                    type:
                      "STRING"
                  },

                  emergency: {
                    type:
                      "STRING"
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


    /* =====================================================
       Gemini API
       暫時性錯誤最多 Retry 1 次
    ===================================================== */

    let response =
      null;

    let data =
      null;

    let finalAttempt =
      0;


    for (
      let attempt = 0;
      attempt <=
        GEMINI_MAX_RETRIES;
      attempt += 1
    ) {

      finalAttempt =
        attempt + 1;


      try {

        /*
         * API Key 改放 Header，
         * 不再放在 URL Query String。
         */
        response =
          await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",

                "x-goog-api-key":
                  process.env
                    .GEMINI_API_KEY
              },

              body:
                JSON.stringify(
                  payload
                )
            }
          );


        data =
          await readGeminiResponse(
            response
          );


      } catch (
        fetchError
      ) {

        /*
         * fetch 本身的暫時性網路錯誤。
         *
         * 第一次失敗：
         * 等待後再試一次。
         */
        if (
          attempt <
          GEMINI_MAX_RETRIES
        ) {

          const delay =
            1000 +
            Math.floor(
              Math.random() *
                500
            );


          console.warn(
            `Gemini network error，${delay}ms 後重試 1 次。`,
            fetchError
          );


          await wait(
            delay
          );


          continue;
        }


        /*
         * 第二次仍為網路錯誤，
         * 交給外層 catch。
         */
        throw fetchError;
      }


      /*
       * 成功：
       * 不執行第二次 API。
       */
      if (
        response.ok
      ) {

        break;
      }


      /*
       * 判斷是否屬於暫時性錯誤。
       */
      const shouldRetry =
        GEMINI_RETRYABLE_STATUS
          .has(
            response.status
          ) &&
        attempt <
          GEMINI_MAX_RETRIES;


      /*
       * 非暫時性錯誤，
       * 或已經 Retry 過一次，
       * 直接停止。
       */
      if (
        !shouldRetry
      ) {

        break;
      }


      /*
       * 1～1.5 秒 Jitter。
       */
      const delay =
        1000 +
        Math.floor(
          Math.random() *
            500
        );


      console.warn(
        `Gemini 暫時性錯誤 HTTP ${response.status}，${delay}ms 後重試 1 次。`
      );


      await wait(
        delay
      );
    }


    /* =====================================================
       Retry 後仍失敗
    ===================================================== */

    if (
      !response ||
      !response.ok
    ) {

      console.error(
        "Gemini API Error:",
        JSON.stringify(
          data,
          null,
          2
        )
      );


      /*
       * 不再把完整 Prompt / payload
       * 回傳給前端。
       *
       * 可降低錯誤 Response 大小，
       * 也避免把內部 Prompt 不必要地送回瀏覽器。
       */
      return res
        .status(
          response?.status ||
            500
        )
        .json({
          error:
            data?.error ||
            data ||
            "Gemini API 呼叫失敗"
        });
    }


    /* =====================================================
       Token 使用紀錄

       不會另外呼叫 Gemini API。
    ===================================================== */

    if (
      data?.usageMetadata
    ) {

      console.log(
        "Gemini usage:",
        {

          model:
            GEMINI_MODEL,


          attemptCount:
            finalAttempt,


          retryCount:
            Math.max(
              0,
              finalAttempt - 1
            ),


          promptTokenCount:
            data
              .usageMetadata
              .promptTokenCount ??
            0,


          candidatesTokenCount:
            data
              .usageMetadata
              .candidatesTokenCount ??
            0,


          totalTokenCount:
            data
              .usageMetadata
              .totalTokenCount ??
            0
        }
      );
    }


    /* =====================================================
       成功回傳

       前端格式維持原本 Gemini Response，
       因此前端 generateAIReport()
       不需要修改。
    ===================================================== */

    return res
      .status(200)
      .json(
        data
      );


  } catch (
    error
  ) {

    console.error(
      "Server Error:",
      error
    );


    return res
      .status(500)
      .json({
        error:
          error?.message ||
          "伺服器發生錯誤"
      });
  }
}

import time
import threading

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from gradio_client import Client

app = FastAPI()

client = Client("Snortle-AI/Snortle-Pancake-1")

state = ""

sessions = {}

predict_lock = threading.Lock()

class PromptRequest(BaseModel):
    prompt: str
    session_id: str

@app.get("/ping")
def ping():
    return {"status": "awake"}

@app.get("/", response_class = HTMLResponse)
def read_root():
    return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Snortle AI Preview</title>

            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@300..700&display=swap" rel="stylesheet">

            <style>
                :root {
                    --bg-color: rgb(18, 18, 18);
                    --mini-text-color: white;
                    --big-text-color: rgb(214, 214, 214);
                    --chat-float-color: rgb(30, 30, 30);
                    --input-bg-color: rgb(48, 48, 48);
                }

                * {
                    font-family: "Quicksand", sans-serif;
                    margin: 0;
                    padding: 0;
                }

                body {
                    background-color: var(--bg-color);
                }

                .title {
                    position: static;
                    top: 0px;
                    display: flex;
                    justify-content: center;
                    color: var(--big-text-color);
                    background-color: var(--chat-float-color);
                    padding: 10px;
                    text-align: center;
                    font-size: 32px;
                }

                #chat-place {
                    max-width: 800px;
                    height: calc(100vh - 60px);
                    margin-left: auto;
                    margin-right: auto;
                    margin-top: 0px;
                }

                .user-box {
                    display: flex;
                    width: 100%;
                    height: fit-content;
                    justify-content: right;
                }

                .user {
                    margin-top: 20px;
                    margin-right: 20px;
                    display: flex;
                    float: right;
                    max-width: 300px;
                    word-break: break-all;
                    font-size: 16px;
                    padding: 15px;
                    border-radius: 16px;
                    background-color: var(--chat-float-color);
                    color: var(--mini-text-color);
                }

                .bot{
                    margin-top: 20px;
                    margin-left: 20px;
                    display: flex;
                    flex-direction: column;
                    float: left;
                    max-width: calc(100% - 40px);
                    word-break: break-word;
                    font-size: 17px;
                    border-radius: 15px;
                    color: var(--mini-text-color);
                    white-space: pre-line;
                }

                form {
                    position: fixed;
                    display: flex;
                    bottom: 15px;
                    left: 0;
                    right: 0;
                    margin-right: auto;
                    margin-left: auto;
                    max-width: 750px;
                    justify-content: space-between;
                    align-items: center;
                }

                #chat-input {
                    width: 100%;
                    padding: 16px;
                    font-size: 15px;
                    color: var(--mini-text-color);
                    background-color: var(--input-bg-color);
                    border-radius: 20px;
                    border-color: white;
                    border-width: 0px;
                    margin-left: 20px;
                    margin-right: 20px;
                }

                #chat-input:focus {
                    width: 100%;
                    padding: 16px;
                    font-size: 15px;
                    color: var(--mini-text-color);
                    background-color: var(--input-bg-color);
                    border-radius: 20px;
                    border-color: white;
                    border-width: 0px;
                }

                #spacer {
                    display: flex;
                    width: 100%;
                    height: 100px;
                }

                .black-out {
                    position: fixed;
                    width: 100vw;
                    height: 75px;
                    bottom: 0px;
                    left: -8px;
                    background-color: var(--bg-color);
                    box-shadow: 0 0px 20px 0px var(--bg-color);
                }

                .bot-reply {
                    white-space: pre-line;
                }

                .bot-caption {
                    margin-top: 8px;
                    font-size: 14px;
                    color: rgba(214, 214, 214, 0.75);
                    letter-spacing: 0.2px;
                    line-height: 1.5;
                }
            </style>
        </head>
        <body>
            <h1 class="title">Snortle AI Preview</h1>
            <main id="chat-place">
                <div id="spacer"></div>
            </main>

            <div class="black-out">
                <form id="form">
                    <input type="text" id="chat-input" autocomplete="off">
                </form>
            </div>

            <script type="module">
                const input = document.getElementById("chat-input");
                const form = document.getElementById("form");
                const spacer = document.getElementById("spacer");
                const mainElement = document.getElementById("chat-place")

                const sessionId = Math.random().toString(36).slice(2);

                function scrollDown() {
                    window.scrollTo({
                        top: document.body.scrollHeight,
                        behavior: 'smooth'
                    });
                }

                async function reply(input) {
                    const bot = document.createElement("div");
                    bot.classList.add("bot");
                    bot.textContent = "Thinking...";
                    spacer.before(bot);
                    scrollDown();

                    try {
                        const res = await fetch('/generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ prompt: input, session_id: sessionId })
                        });

                        if (!res.ok) {
                            throw new Error(`Server returned ${res.status}`);
                        }

                        const { response, thinkTime, generationTime, generatedTokens, totalTime, spent } = await res.json();

                        bot.textContent = "";

                        const replyText = document.createElement("div");
                        replyText.classList.add("bot-reply");
                        replyText.textContent = response;

                        const caption = document.createElement("div");
                        caption.classList.add("bot-caption");
                        caption.textContent =
                            `Thought for ${thinkTime.toFixed(2)}s\n` +
                            `${generatedTokens} tokens in ${generationTime.toFixed(2)}s\n` +
                            `${totalTime.toFixed(2)}s total\n` +
                            `${spent.toFixed(3)} Snortz Coins`;

                        bot.appendChild(replyText);
                        bot.appendChild(caption);
                    } catch (err) {
                        bot.textContent = "Something went wrong: " + err.message;
                    }

                    scrollDown();
                }

                form.addEventListener("submit", function(event) {
                    event.preventDefault();

                    if (input.value.trim() === '') return;

                    const userBox = document.createElement("div");
                    const user = document.createElement("div");

                    user.textContent = input.value;

                    userBox.classList.add("user-box");
                    user.classList.add("user");

                    spacer.before(userBox);
                    userBox.appendChild(user);

                    scrollDown();

                    reply(input.value);

                    input.value = "";
                });

                scrollDown();
            </script>
            
        </body>
        </html>


        """

print("============ CHAT ============")

@app.post("/generate")
def generate(request: PromptRequest):
    session_id = request.session_id
    state = sessions.get(session_id, "")

    user_input = request.prompt

    if not user_input.strip():
        print("Invalid Input")
        return {"response": ""}

    print("")
    print("Thinking...")

    start_time = time.perf_counter()

    with predict_lock:
        result = client.predict(
            prompt = user_input,
            state = state,
            max_tokens = 128,
            api_name = "/predict"
        )

    total_time = time.perf_counter() - start_time

    reply = result["output"]
    think_time = result["think_time"]
    generation_time = result["generation_time"]
    gen_token_count = result["gen_token_count"]
    state = result["state"]

    print(f"Generated {gen_token_count} token(s) in {generation_time:.2f} seconds.")
    print(f"Total round-trip: {total_time:.2f} seconds.")

    think_cost = think_time / 30
    gen_token_cost = gen_token_count / 750

    print("")
    print("Snortz Coins Used:")
    print(f"Thinking: {think_cost:.3f} Snortz Coin(s)")
    print(f"Generation: {gen_token_cost:.3f} Snortz Coin(s)")

    sessions[session_id] = result["state"]

    return {
        "response": reply,
        "thinkTime": think_time,
        "generationTime": generation_time,
        "generatedTokens": gen_token_count,
        "totalTime": total_time,
        "spent": think_cost + gen_token_cost,
    }
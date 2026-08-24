import gc
import streamlit as st

import torch
import torch.nn.functional as F

from transformers import AutoTokenizer

import model_architectures as model_arc

import time

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from huggingface_hub import hf_hub_download

torch.set_num_threads(4)

app = FastAPI()

st.title("Snortle AI")

@st.cache_resource
def get_model():
    token = st.secrets.get("HF_TOKEN", None)
    return hf_hub_download(
        repo_id = "Snortle-AI/tmodel",
        filename = "snortle_pancake_1.pt",
        local_dir = "models",
        token = token,
    )

with st.spinner("Downloading model weights..."):
    try:
        model_path = get_model()
        st.success("Model loaded successfully!")
    except Exception as e:
        st.error(f"Failed to load model: {e}")

model_list = {
    "A" : {
        "model": "Snortle Pancake 1",
        "file": "snortle_pancake_1.py",
        "class": "SnortlePancake1",
        "saved": "snortle_pancake_1.pt",
        "tokenizer": "snortle_tokenizers/snortle_pancake_1_tok"
    }
}

chosen_model = "A"
model_file = None

model_file = model_list[chosen_model]["file"]
model_class = model_list[chosen_model]["class"]
saved = model_list[chosen_model]["saved"]
tok_file = model_list[chosen_model]["tokenizer"]
chosen_model = model_list[chosen_model]["model"]

tokenizer = AutoTokenizer.from_pretrained(tok_file)
model_blueprint = getattr(model_arc, model_class)

model = model_blueprint(tokenizer = tokenizer)

device = torch.device('cpu')

state_dict = torch.load(f"models/{saved}", weights_only = True, map_location = device, mmap = True)

model.load_state_dict(state_dict)
del state_dict
gc.collect()

model.to(device)

model.eval()

class PromptRequest(BaseModel):
    prompt: str

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

                    const res = await fetch('/generate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt: input })
                    });

                    const { response, thinkTime, generationTime, generatedTokens, spent } = await res.json();

                    // clear "Thinking.."
                    bot.textContent = "";

                    const replyText = document.createElement("div");
                    replyText.classList.add("bot-reply");
                    replyText.textContent = response;

                    const caption = document.createElement("div");
                    caption.classList.add("bot-caption");
                    caption.textContent =
                        `Thought for ${thinkTime.toFixed(2)}s · ` +
                        `${generatedTokens} tokens in ${generationTime.toFixed(2)}s · ` +
                        `${spent.toFixed(3)} Snortz Coins`;

                    bot.appendChild(replyText);
                    bot.appendChild(caption);

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

model.eval()

max_output = 128

state = None
reply = ""

gen_token_count = 0

# model = torch.quantization.quantize_dynamic (
#     model = model,
#     dtype = torch.qint8
# )

@app.post("/generate")
def generate(request: PromptRequest):
    global state
    global reply
    global output_ids

    output_ids = []
    reply = ""

    with torch.inference_mode():
        user_input = request.prompt

        if not user_input.strip():
            print("Invalid Input")
            return{"response":""}

        print("")

        print("Thinking...")

        start_time = time.perf_counter()

        input_tensor = torch.tensor(tokenizer.encode(user_input), dtype = torch.long).unsqueeze(0)
        out, state = model(input_tensor, state if state is not None else None)

        think_time = time.perf_counter() - start_time

        start_time = time.perf_counter()

        tok_id = torch.argmax(out[:, -1, :], dim = -1, keepdim = True)

        next_input = tok_id

        reply += tokenizer.decode([tok_id.item()])

        if(tok_id == tokenizer.eos_token_id):
            gen_token_count = 1
        else:
            for t in range(max_output):
                out, state = model(next_input.to(torch.long), state)

                temperature = 0.75
                top_k = 20

                values, indices = torch.topk(out[:, -1, :], top_k)
                probs = F.softmax(values / temperature, dim = -1)
                choice = torch.multinomial(probs, num_samples = 1)
                tok_id = indices.gather(-1, choice)

                next_input = tok_id

                gen_token_count = t + 1

                if(tok_id == tokenizer.eos_token_id):
                    break

                output_ids.append(tok_id.item())

        reply = tokenizer.decode(output_ids)

        generation_time = time.perf_counter() - start_time

        print("\n")

        print(f"Generated {gen_token_count} token(s) in {generation_time:.2f} seconds.")

        think_cost = think_time / 30
        gen_token_cost = gen_token_count / 750

        print("")

        print("Snortz Coins Used:")
        print(f"Thinking: {think_cost:.3f} Snortz Coin(s)")
        print(f"Generation: {gen_token_cost:.3f} Snortz Coin(s)")

        return {
            "response": reply,
            "thinkTime": think_time,
            "generationTime": generation_time,
            "generatedTokens": gen_token_count,
            "spent": think_cost + gen_token_cost,
        }
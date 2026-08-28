import os
import warnings
import logging

warnings.filterwarnings("ignore", message = "cudaGetDeviceCount.*")
logging.getLogger("torch.utils.flop_counter").setLevel(logging.ERROR)

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim

from torch.utils.data import DataLoader

from xlstm.xlstm_large.model import (
    xLSTMLargeConfig, xLSTMLargeBlockStack,
)

from datasets import load_dataset, Dataset
from transformers import AutoTokenizer, Mamba2Config, Mamba2Model

import lightning as L
from lightning.pytorch.callbacks import ModelCheckpoint, EarlyStopping

has_cuda = False

if torch.cuda.is_available():
    has_cuda = True

class xLSTMStack(nn.Module):
    def __init__(self, vocab_size, num_heads, d_model, num_blocks):
        super().__init__()

        if has_cuda:
            xlstm_config = xLSTMLargeConfig (
                num_blocks = num_blocks,
                embedding_dim = d_model,
                num_heads = num_heads,
                vocab_size = vocab_size,
                chunkwise_kernel = "chunkwise--triton_limit_chunk",
                sequence_kernel = "native_sequence__triton",
                step_kernel = "triton",
                mode = "inference",
                chunk_size = 64,
                return_last_states = True,
            )
        else:
            xlstm_config = xLSTMLargeConfig (
                num_blocks = num_blocks,
                embedding_dim = d_model,
                num_heads = num_heads,
                vocab_size = vocab_size,
                chunkwise_kernel = "chunkwise--native_autograd",
                sequence_kernel = "native_sequence__native",
                step_kernel = "native",
                mode = "inference",
                chunk_size = 64,
                return_last_states = True,
            )

        self.xlstm_stack = xLSTMLargeBlockStack(xlstm_config)

    def forward(self, x, state):
        logits, state = self.xlstm_stack(x, state = state)

        return logits, state

class MambaStack(nn.Module):
    def __init__(self, vocab_size, d_model, d_state, expand, head_dim, num_heads, num_layers, n_groups):
        super().__init__()

        self.mamba_stack = Mamba2Model(
            Mamba2Config(
                vocab_size = vocab_size,
                hidden_size = d_model,
                state_size = d_state,
                expand = expand,
                head_dim = head_dim,
                num_heads = num_heads,
                num_hidden_layers = num_layers,
                n_groups = n_groups,
            )
        )

    def forward(self, x, state = None):
        out = self.mamba_stack(inputs_embeds = x, cache_params = state, use_cache = True)

        return out.last_hidden_state, out.cache_params

class Model(L.LightningModule):
    def __init__(self, tokenizer, vocab_size = 16384, context_length = 512):
        super().__init__()

        self.tokenizer = tokenizer
        self.d_model = 768
        self.context_length = context_length

        self.embedding = nn.Embedding(
            num_embeddings = vocab_size,
            embedding_dim = self.d_model
        )

        nn.init.normal_(self.embedding.weight, mean=0.0, std=0.02)

        self.norm1 = nn.RMSNorm(self.d_model)

        self.mamba_stack = MambaStack(
            vocab_size = vocab_size,
            d_model = self.d_model,
            d_state = 64,
            expand = 2,
            head_dim = 96,
            num_heads = 16,
            num_layers = 40,
            n_groups = 8
        )

        self.norm2 = nn.RMSNorm(self.d_model)

        self.xlstm_stack = xLSTMStack(
            vocab_size = vocab_size,
            num_heads = 8,
            d_model = self.d_model,
            num_blocks = 12,
        )

        self.norm3 = nn.RMSNorm(self.d_model)

        self.lm_head = nn.Linear(
            in_features = self.d_model,
            out_features = vocab_size,
            bias = False
        )

        self.lm_head.weight = self.embedding.weight

    def forward(self, x, state = None):
        mamba_state, xlstm_state = state if state is not None else (None, None)

        x = self.embedding(x)
        x = self.norm1(x)

        x, mamba_state = self.mamba_stack(x, state = mamba_state)
        x = self.norm2(x)

        x, xlstm_state = self.xlstm_stack(x, state = xlstm_state)
        x = self.norm3(x)

        x = self.lm_head(x)

        return x, (mamba_state, xlstm_state)

    def training_step(self, batch, batch_idx):
        import time
        t0 = time.time()
        input_ids = batch["input_ids"]
        x = input_ids[:, :-1]
        y = input_ids[:, 1:]
        print(f"[batch {batch_idx}] data ready: {time.time()-t0:.2f}s")

        prediction = self(x)
        print(f"[batch {batch_idx}] forward done: {time.time()-t0:.2f}s")

        print(prediction.min().item(), prediction.max().item(), prediction.mean().item())
        print(self.tokenizer.pad_token_id, self.tokenizer.pad_token, self.tokenizer.eos_token)

        loss = F.cross_entropy(prediction.transpose(1,2), y, ignore_index = self.tokenizer.pad_token_id)
        print(f"[batch {batch_idx}] loss computed: {time.time()-t0:.2f}s")

        self.log("train_loss", loss, prog_bar = True)
        return loss

    def validation_step(self, batch, batch_idx):
        input_ids = batch["input_ids"]

        x = input_ids[:, :-1]
        y = input_ids[:, 1:]

        prediction = self(x)
        loss = F.cross_entropy(
            prediction.transpose(1, 2),
            y,
            ignore_index = self.tokenizer.pad_token_id
        )

        self.log("val_loss", loss, prog_bar = True)

        return loss

    def configure_optimizers(self):
        return optim.AdamW(self.parameters(), lr = 0.0003, weight_decay = 0.001)
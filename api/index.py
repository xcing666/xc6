#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Vercel Serverless Function: AI Image Analysis API
Uses Hugging Face CLIP model + Pillow for quality analysis
"""

import sys
import json
import base64
import os
from io import BytesIO

# ===== Import dependencies =====
IMPORT_OK = True
ERROR_MSG = ""

try:
    from PIL import Image, ImageStat, ImageFilter
    import numpy as np
except Exception as e:
    IMPORT_OK = False
    ERROR_MSG = str(e)


def analyze_image_local(image_bytes):
    """Local image analysis using PIL/NumPy (fallback when HF is unavailable)"""
    try:
        img = Image.open(BytesIO(image_bytes))
        if img.mode != "RGB":
            img = img.convert("RGB")
        w, h = img.size

        # 1. Sharpness: Laplacian variance
        gray = img.convert("L")
        sharp_arr = np.array(gray)
        lap = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=float)
        from scipy.ndimage import convolve
        try:
            lap_var = convolve(sharp_arr.astype(float), lap).var()
        except ImportError:
            # Fallback: use simple edge detection
            sharp_filtered = gray.filter(ImageFilter.FIND_EDGES)
            sharp_arr2 = np.array(sharp_filtered)
            lap_var = np.var(sharp_arr2)
        sharpness_score = min(100, max(0, int(lap_var / 50 * 100)))

        # 2. Exposure: histogram analysis
        hist = img.histogram()[:256]
        total_pixels = w * h
        brightness = sum(i * v for i, v in enumerate(hist)) / total_pixels
        if brightness < 60:
            exposure_score = max(0, 40 + int(brightness))
            exposure_label = "欠曝"
        elif brightness > 200:
            exposure_score = max(0, 100 - int((brightness - 200) / 2))
            exposure_label = "过曝"
        else:
            exposure_score = 80 + int(20 * (1 - abs(brightness - 128) / 128))
            exposure_label = "正常"

        # 3. Composition: rule-of-thirds center weight
        arr = np.array(img)
        th, tw = h // 3, w // 3
        center_region = arr[th:2*th, tw:2*tw]
        outer_region_top = arr[:th, :]
        outer_region_bot = arr[2*th:, :]
        outer_region_left = arr[:, :tw]
        outer_region_right = arr[:, 2*tw:]
        center_std = float(np.std(center_region))
        outer_std = (
            float(np.std(outer_region_top)) +
            float(np.std(outer_region_bot)) +
            float(np.std(outer_region_left)) +
            float(np.std(outer_region_right))
        ) / 4
        if outer_std > 0:
            comp_ratio = min(center_std / outer_std, 3) / 3
        else:
            comp_ratio = 0.5
        composition_score = int(comp_ratio * 70 + 30)

        # Overall score
        overall = int(sharpness_score * 0.4 + exposure_score * 0.3 + composition_score * 0.3)

        return {
            "sharpness": {"score": sharpness_score, "label": "高" if sharpness_score > 65 else ("中" if sharpness_score > 35 else "低")},
            "exposure": {"score": exposure_score, "label": exposure_label},
            "composition": {"score": composition_score, "label": "优" if composition_score > 65 else ("良" if composition_score > 35 else "差")},
            "overall": {"score": overall, "label": "优秀" if overall >= 75 else ("良好" if overall >= 55 else ("一般" if overall >= 35 else "需改进"))},
            "ai_enabled": False,
            "method": "local_analysis"
        }
    except Exception as e:
        return {
            "error": f"Analysis failed: {str(e)}",
            "ai_enabled": False,
            "method": "error"
        }


def call_hf_clip_api(image_b64, token):
    """Call Hugging Face Inference API with CLIP model for aesthetic scoring"""
    import urllib.request
    import urllib.error

    url = "https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    payload = json.dumps({
        "inputs": image_b64,
        "parameters": {
            "candidate_labels": [
                "high quality professional photo",
                "average photo",
                "low quality blurry photo"
            ]
        }
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            scores = {}
            for item in result:
                scores[item["label"]] = item["score"]

            high_q = scores.get("high quality professional photo", 0)
            avg_q = scores.get("average photo", 0)

            ai_score = int(high_q * 90 + avg_q * 10)
            return {
                "ai_aesthetic_score": min(100, max(0, ai_score)),
                "ai_confidence": high_q,
                "ai_enabled": True,
                "method": "huggingface_clip"
            }
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return {
            "error": f"HF API error {e.code}: {body}",
            "ai_enabled": False,
            "method": "hf_error"
        }
    except Exception as e:
        return {
            "error": f"HF request failed: {str(e)}",
            "ai_enabled": False,
            "method": "hf_error"
        }


class Request:
    """Mock request object for Vercel compatibility"""
    def __init__(self):
        self.method = ""
        self.body = b""
        self.headers = {}


def handler(request=None):
    """Main handler - supports both Vercel and local testing"""
    if not IMPORT_OK:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"依赖导入失败: {ERROR_MSG}"})
        }

    method = getattr(request, "method", "GET") or "GET"

    # Health check endpoint
    if method == "GET":
        hf_token = os.environ.get("HUGGINGFACE_TOKEN", "")
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({
                "status": "ok",
                "ai_available": bool(hf_token),
                "version": "1.0.0"
            })
        }

    # Analyze endpoint (POST)
    if method != "POST":
        return {
            "statusCode": 405,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "仅支持 POST 和 GET 请求"})
        }

    try:
        body = getattr(request, "body", None) or b""
        if isinstance(body, str):
            data = json.loads(body)
        else:
            data = json.loads(body.decode("utf-8"))

        image_b64 = data.get("image", "")
        filename = data.get("filename", "unknown.jpg")

        if not image_b64:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "缺少图片数据"})
            }

        # Decode base64
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_b64)

        # Local analysis (always runs)
        local_result = analyze_image_local(image_bytes)

        # Try AI analysis via Hugging Face
        hf_token = os.environ.get("HUGGINGFACE_TOKEN", "")
        if hf_token:
            ai_result = call_hf_clip_api(data.get("image", ""), hf_token)
            if ai_result.get("ai_enabled"):
                # Combine AI score with local analysis
                ai_score = ai_result.get("ai_aesthetic_score", 50)
                local_overall = local_result.get("overall", {}).get("score", 50)
                blended_score = int(ai_score * 0.6 + local_overall * 0.4)
                local_result["overall"]["score"] = blended_score
                if blended_score >= 75:
                    local_result["overall"]["label"] = "优秀"
                elif blended_score >= 55:
                    local_result["overall"]["label"] = "良好"
                elif blended_score >= 35:
                    local_result["overall"]["label"] = "一般"
                else:
                    local_result["overall"]["label"] = "需改进"
                local_result["ai"] = ai_result
            else:
                local_result["ai"] = ai_result
        else:
            local_result["ai"] = {"ai_enabled": False, "reason": "no_token"}

        local_result["filename"] = filename
        local_result["dimensions": "{}x{}".format(
            Image.open(BytesIO(image_bytes)).size[0],
            Image.open(BytesIO(image_bytes)).size[1]
        )] if True else ""

        return {
            "statusCode": 200,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(local_result)
        }

    except json.JSONDecodeError:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "无效的 JSON 数据"})
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": f"服务器错误: {str(e)}"})
        }


# Vercel entry point
if __name__ == "__main__":
    # For local testing: python api/index.py
    print(json.dumps(handler(Request()), ensure_ascii=False, indent=2))

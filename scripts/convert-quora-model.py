#!/usr/bin/env python3
"""
Convert cross-encoder/quora-distilroberta-base to ONNX format
compatible with @xenova/transformers JavaScript library.

This script:
1. Exports the model to ONNX format using optimum
2. Quantizes it to reduce size
3. Structures files for @xenova/transformers compatibility

Run with:
  conda activate model-convert
  python scripts/convert-quora-model.py
"""

import os
import sys
import shutil
from pathlib import Path

def main():
    try:
        from optimum.exporters.onnx import main_export
        from optimum.onnxruntime import ORTQuantizer
        from optimum.onnxruntime.configuration import AutoQuantizationConfig
    except ImportError as e:
        print(f"Import error: {e}")
        print("\nInstall dependencies with:")
        print('  pip install "optimum-onnx[onnxruntime]"')
        sys.exit(1)

    model_id = "cross-encoder/quora-distilroberta-base"
    output_dir = Path("models/cross-encoder/quora-distilroberta-base")
    
    # Clean up old files
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Converting {model_id} to ONNX format...")
    print(f"Output directory: {output_dir}")
    
    # Export to ONNX (this also converts tokenizer to correct format)
    main_export(
        model_name_or_path=model_id,
        output=str(output_dir),
        task="text-classification",
        opset=14,
        device="cpu",
    )
    
    print("\nQuantizing model (int8)...")
    try:
        quantizer = ORTQuantizer.from_pretrained(output_dir)
        qconfig = AutoQuantizationConfig.avx2(is_static=False, per_channel=False)
        quantizer.quantize(save_dir=output_dir, quantization_config=qconfig)
        print("Quantization complete.")
        
        # Use quantized model as main model
        quant_file = output_dir / "model_quantized.onnx"
        main_file = output_dir / "model.onnx"
        if quant_file.exists():
            main_file.unlink()
            quant_file.rename(main_file)
            print(f"Using quantized model: {main_file.stat().st_size / 1024 / 1024:.2f} MB")
    except Exception as e:
        print(f"Quantization failed: {e}")
        print("Using full-precision model instead.")
    
    # Move model.onnx to onnx/ subfolder (expected by @xenova/transformers)
    onnx_dir = output_dir / "onnx"
    onnx_dir.mkdir(exist_ok=True)
    
    model_file = output_dir / "model.onnx"
    if model_file.exists():
        target = onnx_dir / "model.onnx"
        shutil.move(str(model_file), str(target))
        print(f"Moved to: {target}")
    
    print(f"\n✓ Conversion complete!")
    print(f"Model files are in: {output_dir}")

if __name__ == "__main__":
    main()

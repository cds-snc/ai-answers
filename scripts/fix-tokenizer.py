#!/usr/bin/env python3
"""
Fix tokenizer.json merges format for @xenova/transformers compatibility.
Converts ["a b", "c d"] format to [["a", "b"], ["c", "d"]] format.
"""

import json
from pathlib import Path

def fix_tokenizer(tokenizer_path: Path):
    print(f"Fixing tokenizer: {tokenizer_path}")
    
    with open(tokenizer_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Check if merges need fixing
    model = data.get('model', {})
    merges = model.get('merges', [])
    
    if not merges:
        print("No merges found in tokenizer")
        return
    
    # Check format of first merge
    if isinstance(merges[0], list):
        print(f"Converting {len(merges)} merges from array to string format...")
        # Convert ["a", "b"] to "a b"
        new_merges = [" ".join(m) for m in merges]
        data['model']['merges'] = new_merges
        
        # Backup original
        backup_path = tokenizer_path.with_suffix('.json.bak')
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)
        
        # Write fixed version
        with open(tokenizer_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"✓ Fixed tokenizer saved to {tokenizer_path}")
    elif isinstance(merges[0], str):
        print("Merges already in string format, no fix needed")
    else:
        print(f"Unexpected merges format: {type(merges[0])}")

if __name__ == "__main__":
    tokenizer_path = Path("models/cross-encoder/quora-distilroberta-base/tokenizer.json")
    if tokenizer_path.exists():
        fix_tokenizer(tokenizer_path)
    else:
        print(f"Tokenizer not found at {tokenizer_path}")

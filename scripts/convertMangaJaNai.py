import os
import subprocess
import torch
from spandrel import ModelLoader

MODELS = [
    {
        "pth": "/tmp/models_src/2x_MangaJaNai_1600p_V1_ESRGAN_90k.pth",
        "name": "mangajanai-2x-1600p",
        "scale": 2,
    },
    {
        "pth": "/tmp/models_src/4x_MangaJaNai_1600p_V1_ESRGAN_70k.pth",
        "name": "mangajanai-4x-1600p",
        "scale": 4,
    },
    {
        "pth": "/tmp/models_src/4x_IllustrationJaNai_V1_ESRGAN_135k.pth",
        "name": "illustrationjanai-4x",
        "scale": 4,
    },
]

PNNX_BIN = "/tmp/pnnx/pnnx-20261020-macos/pnnx"
OUT_DIR = "/tmp/models_out"
os.makedirs(OUT_DIR, exist_ok=True)

loader = ModelLoader()

for item in MODELS:
    pth_path = item["pth"]
    name = item["name"]
    print(f"\n==========================================")
    print(f"Processing {name} from {pth_path}...")
    
    desc = loader.load_from_file(pth_path)
    model = desc.model.eval().to("cpu")
    
    # Trace
    x = torch.rand(1, 3, 64, 64)
    pt_path = os.path.join(OUT_DIR, f"{name}.pt")
    traced = torch.jit.trace(model, x)
    traced.save(pt_path)
    print(f"  Traced model saved to {pt_path}")
    
    # Run PNNX
    param_path = os.path.join(OUT_DIR, f"{name}.param")
    bin_path = os.path.join(OUT_DIR, f"{name}.bin")
    
    cmd = [
        PNNX_BIN,
        pt_path,
        "inputshape=[1,3,64,64]",
        f"ncnnparam={param_path}",
        f"ncnnbin={bin_path}",
        "fp16=1",
        "optlevel=2",
    ]
    print(f"  Running PNNX command...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"  ERROR running PNNX: {res.stderr}")
        continue
    
    # Fix blob names: in0 -> data, out0 -> output
    with open(param_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Replace in0 with data and out0 with output
    # Specifically:
    # "Input in0 0 1 in0" -> "Input in0 0 1 data"
    # and subsequent layer consuming in0 -> data
    # and last layer producing out0 -> output
    lines = content.splitlines()
    new_lines = []
    for line in lines:
        parts = line.split()
        if len(parts) >= 2:
            if parts[0] == "Input" and parts[1] == "in0":
                # Input in0 0 1 in0 -> Input in0 0 1 data
                line = line.replace(" 1 in0", " 1 data")
            else:
                # Any layer consuming in0
                if " in0 " in line or line.endswith(" in0"):
                    line = line.replace(" in0", " data")
            
            # Any layer producing out0
            if " out0 " in line or line.endswith(" out0"):
                line = line.replace(" out0", " output")
        new_lines.append(line)
        
    fixed_content = "\n".join(new_lines) + "\n"
    with open(param_path, "w", encoding="utf-8") as f:
        f.write(fixed_content)
        
    print(f"  Fixed input/output blob names in {param_path}")
    print(f"  Successfully generated {param_path} ({os.path.getsize(param_path)} bytes) and {bin_path} ({os.path.getsize(bin_path)} bytes)")

print("\nAll models processed successfully!")

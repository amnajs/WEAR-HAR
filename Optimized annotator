import os
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import tkinter as tk
from tkinter import messagebox
from scipy.ndimage import gaussian_filter1d


RAW_FILES = {
    "LH": r"our version/opt data s2/LH-s2.csv",
    "LL": r"our version/opt data s2/LL-s2.csv",
    "RH": r"our version/opt data s2/RH-s2.csv",
    "RL": r"our version/opt data s2/RL-s2.csv",
}

EXCEL_LOG_FILE = "exercise.xlsx"


SAMPLING_RATE_HZ = 12.5 
SAMPLE_INTERVAL_SEC = 1.0 / SAMPLING_RATE_HZ  # 0.08 seconds (80 ms)

# Automatic synchronization margins (22 seconds of sync jumps)
SYNC_START_PADDING = int(22 * SAMPLING_RATE_HZ)
SYNC_END_PADDING = int(22 * SAMPLING_RATE_HZ)

# Intermediary File Structure
OUTPUT_FOLDER = "synced_s2"
MERGED_FILE = os.path.join(OUTPUT_FOLDER, "merged_s2++.csv")
PREPROC_FILE = os.path.join(OUTPUT_FOLDER, "prepros_s2.csv")
PROJECTED_FILE = os.path.join(OUTPUT_FOLDER, "peak_id_s2.csv")
LABELED_FILE = os.path.join(OUTPUT_FOLDER, "labelled_s2.csv")
FINAL_OUTPUT_FILE = os.path.join(OUTPUT_FOLDER, "annotated_s2.csv")

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


COLORS = ["#32CD32", "#FFD700", "#FF4500", "#1E90FF", "#BA55D3", "#FF69B4", "#40E0D0"]
WATCH_COLORS = {
    "LH": {"smooth": "#d35400", "raw": "#f5cba7"}, 
    "RH": {"smooth": "#27ae60", "raw": "#abebc6"}, 
    "LL": {"smooth": "#2980b9", "raw": "#aed6f1"}, 
    "RL": {"smooth": "#8e44ad", "raw": "#d7bde2"}  
}


def magnitude(df):
    return np.sqrt(df["acc_x"]**2 + df["acc_y"]**2 + df["acc_z"]**2)


#-------------0-sync-----------------

def run_step_0_sync():
    print("\n--- STEP 0: Synchronizing Watch Timelines ---")
    signals = {}
    dfs = {}
    clicked = {}

    for watch, file in RAW_FILES.items():
        if not os.path.exists(file):
            print(f"Error: File {file} not found. Check configuration paths.")
            return False
        df = pd.read_csv(file)
        dfs[watch] = df
        signals[watch] = magnitude(df)

    # Manual peak selection
    for watch in RAW_FILES:
        plt.figure(figsize=(15, 4))
        plt.plot(signals[watch])
        plt.title(f"{watch} - Click the EXACT same peak of the first sync jump")
        plt.xlabel("Sample Index")
        plt.ylabel("Magnitude")
        
        print(f"Click synchronization peak for {watch}")
        point = plt.ginput(1)
        plt.close()
        clicked[watch] = int(point[0][0])

    print("Clicked synchronization points:", clicked)

    # Shift calculations relative to the earliest clicked boundary
    earliest_click = min(clicked.values())
    aligned = {}

    for watch in RAW_FILES:
        shift = clicked[watch] - earliest_click
        print(f"{watch}: shifting back by {shift} samples")
        
        df = dfs[watch].copy()
        if shift > 0:
            df = df.iloc[shift:].reset_index(drop=True)
        aligned[watch] = df

    # Trim tails to match the shortest dataset
    min_len = min(len(df) for df in aligned.values())
    for watch in aligned:
        aligned[watch] = aligned[watch].iloc[:min_len].reset_index(drop=True)

    # Save outputs
    for watch, df in aligned.items():
        out_path = os.path.join(OUTPUT_FOLDER, f"{watch}_sync.csv")
        df.to_csv(out_path, index=False)
        print(f"Saved synced file: {out_path}")

    # Display preview overlap plot
    plt.figure(figsize=(18, 6))
    for watch in aligned:
        plt.plot(magnitude(aligned[watch]), label=watch, linewidth=1, alpha=0.7)
    plt.title("Preview of Aligned Signals (Peaks should overlap now)")
    plt.xlabel("Aligned Sample Index")
    plt.ylabel("Magnitude")
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.show()
    return True

#-------------1-merge-----------------

def run_step_1_merge():
    print("\n--- STEP 1: Merging Timelines ---")
    FILES = {
        "LH": os.path.join(OUTPUT_FOLDER, "LH_sync.csv"),
        "LL": os.path.join(OUTPUT_FOLDER, "LL_sync.csv"),
        "RH": os.path.join(OUTPUT_FOLDER, "RH_sync.csv"),
        "RL": os.path.join(OUTPUT_FOLDER, "RL_sync.csv"),
    }

    data = {}
    for watch, file in FILES.items():
        data[watch] = pd.read_csv(file)

    lengths = [len(df) for df in data.values()]
    min_length = min(lengths)
    print(f"Aligning to minimum length of {min_length} samples.")

    merged = pd.DataFrame()
    raw_time = data["LH"]["time"].iloc[:min_length].reset_index(drop=True)

    is_time_corrupt = (
        raw_time.isna().all() or 
        raw_time.astype(str).str.contains("NaN").all() or 
        (raw_time.astype(str).str.strip() == "").all()
    )

    if is_time_corrupt:
        print("Raw time column is corrupt. Reconstructing clean timeline at 12.5 Hz...")
        reconstructed_times = []
        for i in range(min_length):
            total_seconds = i * SAMPLE_INTERVAL_SEC
            h = int(total_seconds // 3600)
            m = int((total_seconds % 3600) // 60)
            s = int(total_seconds % 60)
            ms = int(round((total_seconds - int(total_seconds)) * 100))
            reconstructed_times.append(f"{h:02d}:{m:02d}:{s:02d}.{ms:02d}")
        merged["time"] = reconstructed_times
    else:
        merged["time"] = raw_time.replace(r".*NaN.*", np.nan, regex=True).ffill().bfill()

    for watch in ["LH", "LL", "RH", "RL"]:
        df_watch = data[watch].iloc[:min_length].reset_index(drop=True)
        merged[f"{watch}_acc_x"] = df_watch["acc_x"]
        merged[f"{watch}_acc_y"] = df_watch["acc_y"]
        merged[f"{watch}_acc_z"] = df_watch["acc_z"]

    # Smooth sensor NaNs
    sensor_cols = [col for col in merged.columns if col != "time"]
    merged[sensor_cols] = merged[sensor_cols].interpolate(method="linear", limit_direction="both").ffill().bfill().fillna(0.0)

    merged.to_csv(MERGED_FILE, index=False)
    print(f"Merged file saved to: {MERGED_FILE}")


#-------------2-preprocessing-----------------

def run_step_2_preprocess():
    print("\n--- STEP 2: Preprocessing Features (AC Magnitude) ---")
    df = pd.read_csv(MERGED_FILE)
    
    processed_df = pd.DataFrame()
    processed_df["time"] = df["time"]
    
    for watch in ["LH", "LL", "RH", "RL"]:
        x = df[f"{watch}_acc_x"]
        y = df[f"{watch}_acc_y"]
        z = df[f"{watch}_acc_z"]
        
        raw_mag = np.sqrt(x**2 + y**2 + z**2)
        # AC Magnitude removes standard 1g gravity component
        processed_df[f"{watch}_energy"] = np.abs(raw_mag - 1.0)
        
    if "label" in df.columns:
        processed_df["label"] = df["label"]
    else:
        processed_df["label"] = "rest"
        
    processed_df.to_csv(PREPROC_FILE, index=False)
    print(f"Preprocessed features exported: {PREPROC_FILE}")


#-------------3-labelling-----------------
def run_step_3_project_templates():
    print("\n--- STEP 3: Creating Initial Template Blocks ---")
    planned_exercises = []
    
    if os.path.exists(EXCEL_LOG_FILE):
        try:
            log_df = pd.read_excel(EXCEL_LOG_FILE)
            log_df.columns = [str(c).strip().lower() for c in log_df.columns]
            
            name_col = next((c for c in ["exercises", "exercise"] if c in log_df.columns), None)
            dur_col = next((c for c in ["intervals_sec", "duration"] if c in log_df.columns), None)
            
            if name_col:
                names = log_df[name_col].dropna().astype(str).str.strip().tolist()
                durations = log_df[dur_col].dropna().astype(float).tolist() if dur_col else [30.0] * len(names)
                for name, dur in zip(names, durations):
                    planned_exercises.append({"name": name, "raw_dur": dur})
                print(f"Successfully loaded sequence from {EXCEL_LOG_FILE}")
        except Exception as e:
            print(f"Warning parsing Excel sequence: {e}")

    if not planned_exercises:
        default_names = ["joggies", "jumping_jacks", "shoulder_stretch", "lunges", "pushups", "situps", "chair_dips"]
        planned_exercises = [{"name": n, "raw_dur": 30.0} for n in default_names]
        print("Default exercise sequence fallback configured.")

    df = pd.read_csv(PREPROC_FILE)
    total_samples = len(df)

    start_index = SYNC_START_PADDING
    end_index = total_samples - SYNC_END_PADDING
    available_samples = end_index - start_index

    if available_samples <= 0:
        print("Error: Dataset size is smaller than the requested sync padding!")
        return

    total_planned_time = sum([item["raw_dur"] for item in planned_exercises])
    current_sample = start_index
    projected_segments = []

    for item in planned_exercises:
        proportion = item["raw_dur"] / total_planned_time
        allocated_samples = int(available_samples * proportion)
        
        seg_start = current_sample
        seg_end = current_sample + allocated_samples
        
        work_duration = int(allocated_samples * 0.85) # Default 15% rest spacing
        adjusted_end = seg_start + work_duration
        
        projected_segments.append({
            "start_sample": int(seg_start),
            "end_sample": int(adjusted_end),
            "duration_sec": float((adjusted_end - seg_start) / SAMPLING_RATE_HZ),
            "watches": "LH,RH,LL,RL",
            "exercise": item["name"]
        })
        current_sample = seg_end

    output_df = pd.DataFrame(projected_segments)
    output_df.to_csv(PROJECTED_FILE, index=False)
    print(f"Projected initial estimate templates to: {PROJECTED_FILE}")



class DragLabelApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Dataset Annotation Tool (Drag-and-Drop Mode)")
        self.root.geometry("1400x850")
        
      
        self.energy_df = pd.read_csv(PREPROC_FILE)
        self.total_samples = len(self.energy_df)
        
       
        self.smooth_df = pd.DataFrame()
        for watch in ["LH", "RH", "LL", "RL"]:
            self.smooth_df[f"{watch}_smooth"] = gaussian_filter1d(self.energy_df[f"{watch}_energy"], sigma=10)

        # Step down factor to keep tkinter refresh rate fast and smooth
        self.STEP = 5
        self.plot_samples = self.total_samples // self.STEP

        # Parse Projected Segment boundaries
        segments = pd.read_csv(PROJECTED_FILE)
        self.blocks = []
        for idx, row in segments.iterrows():
            self.blocks.append({
                "index": idx,
                "start": int(row["start_sample"]),
                "end": int(row["end_sample"]),
                "label": row["exercise"],
                "color": COLORS[idx % len(COLORS)]
            })

        self.active_block = None
        self.active_edge = None
        
        # User Interface Elements
        self.top_frame = tk.Frame(root, bg="#2c3e50", padx=10, pady=10)
        self.top_frame.pack(fill="x")
        
        title = tk.Label(self.top_frame, text="Drag any block's edges horizontally to align them to the signals. Close window to save.", 
                         font=("Arial", 11, "bold"), fg="white", bg="#2c3e50")
        title.pack()

        self.canvas = tk.Canvas(root, bg="#fcfcfc", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True, padx=20, pady=10)
        
        self.canvas.bind("<Configure>", self.on_resize)
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_drag)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)
        self.canvas.bind("<Motion>", self.update_cursor)

    def get_coords(self, sample_idx, val, track_idx):
        w = self.canvas.winfo_width()
        h = self.canvas.winfo_height()
        
        margin_x = 80
        margin_y = 40
        track_h = (h - (margin_y * 2)) / 4
        
        x = margin_x + (sample_idx / self.total_samples) * (w - margin_x * 2)
        
        track_top = margin_y + track_idx * track_h
        track_bottom = track_top + track_h - 20
        
        normalized_val = min(max(val, 0.0), 2.0) / 2.0
        y = track_bottom - normalized_val * (track_bottom - track_top)
        
        return x, y

    def draw_plots(self):
        self.canvas.delete("all")
        w = self.canvas.winfo_width()
        h = self.canvas.winfo_height()
        if w < 100 or h < 100:
            return

        margin_x = 80
        margin_y = 40
        track_h = (h - (margin_y * 2)) / 4
        watches = ["LH", "RH", "LL", "RL"]

        # Draw grid, track lines, and signals
        for t_idx, watch in enumerate(watches):
            track_top = margin_y + t_idx * track_h
            track_bottom = track_top + track_h - 20
            
            # Watch Lane Header
            self.canvas.create_text(35, (track_top + track_bottom)/2, text=watch, 
                                    font=("Arial", 12, "bold"), fill="#2c3e50")
            
            # Baseline track guide
            self.canvas.create_line(margin_x, track_bottom, w - margin_x, track_bottom, fill="#e0e0e0", width=1)
            
            # 1. Draw RAW AC magnitude (Lighter/Thinner background line)
            coords_raw = []
            for i in range(0, self.plot_samples, 2):
                orig_idx = i * self.STEP
                val = self.energy_df.at[orig_idx, f"{watch}_energy"]
                cx, cy = self.get_coords(orig_idx, val, t_idx)
                coords_raw.append((cx, cy))
            
            if len(coords_raw) > 1:
                self.canvas.create_line(coords_raw, fill=WATCH_COLORS[watch]["raw"], width=1)

            # 2. Draw SMOOTHED AC magnitude (Bold primary line)
            coords_smooth = []
            for i in range(0, self.plot_samples, 2):
                orig_idx = i * self.STEP
                val = self.smooth_df.at[orig_idx, f"{watch}_smooth"]
                cx, cy = self.get_coords(orig_idx, val, t_idx)
                coords_smooth.append((cx, cy))
            
            if len(coords_smooth) > 1:
                self.canvas.create_line(coords_smooth, fill=WATCH_COLORS[watch]["smooth"], width=2)

        # Draw interactive color boundaries
        for b in self.blocks:
            x_start, _ = self.get_coords(b["start"], 0, 0)
            x_end, _ = self.get_coords(b["end"], 0, 0)
            
            # Block overlay
            self.canvas.create_rectangle(x_start, margin_y, x_end, h - margin_y - 20, 
                                         fill=b["color"], stipple="gray25", outline=b["color"], width=2)
            
            # Drag Handle text labels
            text_y = h - margin_y - 45
            self.canvas.create_rectangle(x_start, text_y-12, x_end, text_y+12, fill="white", outline=b["color"], width=1.5)
            self.canvas.create_text((x_start+x_end)/2, text_y, text=b["label"], font=("Arial", 9, "bold"), fill="black")

    def on_resize(self, event):
        self.draw_plots()

    def get_click_target(self, x_click):
        w = self.canvas.winfo_width()
        tolerance = 15
        
        for b in self.blocks:
            x_start, _ = self.get_coords(b["start"], 0, 0)
            x_end, _ = self.get_coords(b["end"], 0, 0)
            
            if abs(x_click - x_start) < tolerance:
                return b, "start"
            elif abs(x_click - x_end) < tolerance:
                return b, "end"
        return None, None

    def update_cursor(self, event):
        target, _ = self.get_click_target(event.x)
        if target:
            self.canvas.config(cursor="size_we")
        else:
            self.canvas.config(cursor="")

    def on_press(self, event):
        target, edge = self.get_click_target(event.x)
        if target:
            self.active_block = target
            self.active_edge = edge

    def on_drag(self, event):
        if not self.active_block:
            return
        
        w = self.canvas.winfo_width()
        margin_x = 80
        
        pct = (event.x - margin_x) / (w - margin_x * 2)
        pct = min(max(pct, 0.0), 1.0)
        target_sample = int(pct * self.total_samples)
        
        if self.active_edge == "start" and target_sample < self.active_block["end"]:
            self.active_block["start"] = target_sample
        elif self.active_edge == "end" and target_sample > self.active_block["start"]:
            self.active_block["end"] = target_sample
            
        self.draw_plots()

    def on_release(self, event):
        self.active_block = None
        self.active_edge = None


def run_step_4_gui_labeling():
    print("\n--- Launching Boundary Calibration Visualizer ---")
    
    def on_close():
        updated_rows = []
        for b in app.blocks:
            # Reconstruct duration based on active SAMPLING_RATE_HZ config (12.5 Hz)
            updated_rows.append({
                "start_sample": b["start"],
                "end_sample": b["end"],
                "duration_sec": float((b["end"] - b["start"]) / SAMPLING_RATE_HZ),
                "watches": "LH,RH,LL,RL",
                "exercise": b["label"]
            })
        
        final_df = pd.DataFrame(updated_rows)
        final_df.to_csv(LABELED_FILE, index=False)
        print(f"Saved optimized interval labels directly to: {LABELED_FILE}")
        root.destroy()

    root = tk.Tk()
    app = DragLabelApp(root)
    root.protocol("WM_DELETE_WINDOW", on_close)
    root.mainloop()


#-------------5-annotating-----------------

def run_step_5_annotate():
    print("\n--- STEP 5: Compiling Final Labeled Training Dataset ---")
    if not os.path.exists(LABELED_FILE):
        print(f"Aborting annotation: {LABELED_FILE} not found.")
        return

    df_signals = pd.read_csv(PREPROC_FILE)
    df_intervals = pd.read_csv(LABELED_FILE)

    # Set resting baseline
    df_signals['label'] = 'rest'

    for _, row in df_intervals.iterrows():
        start = int(row['start_sample'])
        end = int(row['end_sample'])
        exercise_name = row['exercise']
        
        # Apply labels over the physical sample boundaries
        df_signals.loc[start:end, 'label'] = exercise_name

    df_signals.to_csv(FINAL_OUTPUT_FILE, index=False)
    print("\n" + "="*50)
    print(f" Labeled dataset ready at: {FINAL_OUTPUT_FILE}")
    print(f"Total Rows      : {len(df_signals)}")
    print("\nTraining Class Distribution:")
    print(df_signals['label'].value_counts())
    print("="*50)


#-------------main-----------------
if __name__ == "__main__":
    print("STARTING")
   
    
    # 1. Align timelines manually (ginput)
    sync_success = run_step_0_sync()
    
    if sync_success:
        # 2. Merge and reconstruct timeline to remove NaNs
        run_step_1_merge()
        
        # 3. Preprocess signals (AC Magnitude feature extraction)
        run_step_2_preprocess()
        
        # 4. Project templates based on the sequence durations
        run_step_3_project_templates()
        
        # 5. Interactive drag and drop label adjustments
        run_step_4_gui_labeling()
        
        # 6. Apply markers to create final annotated CSV
        run_step_5_annotate()
        
        print("\n----------------------------------")
        print("Processing finished! All data products have been saved to synced_s2/.")

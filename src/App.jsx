import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [segments, setSegments] = useState([
    { start: 0, end: 0 },
    { start: 0, end: 0 },
    { start: 0, end: 0 },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef(null);
  const ffmpegRef = useRef(new FFmpeg());

  // Load FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      const ffmpeg = ffmpegRef.current;
      console.log("🚀 ~ before loadFFmpeg ~ ffmpeg:", ffmpeg);
      const baseURL = `https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm`;

      ffmpeg.on("progress", ({ progress }) => {
        setProgress(Math.round(progress * 100));
      });

      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript"
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm"
          ),
          workerURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.worker.js`,
            "text/javascript"
          ),
        });
        console.log("🚀 ~ after loadFFmpeg ~ ffmpeg:", ffmpeg);
      } catch (error) {
        console.log("FFmpeg loading error:", error);
      }
    };

    loadFFmpeg();

    return () => {
      // Cleanup
      if (ffmpegRef.current) {
        ffmpegRef.current.terminate();
      }
    };
  }, []);

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
    }
  };

  // Update video duration when loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration;
      setDuration(videoDuration);
    }
  };

  // Handle segment time changes
  const handleSegmentChange = (index, field, value) => {
    const newSegments = [...segments];
    newSegments[index][field] = Math.max(
      0,
      Math.min(duration, parseFloat(value))
    );
    setSegments(newSegments);
  };

  // Format time for display
  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const handleTrimAndDownload = async () => {
    if (!videoFile) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      const ffmpeg = ffmpegRef.current;
      await ffmpeg.writeFile("input.mp4", await fetchFile(videoFile));

      for (let i = 0; i < segments.length; i++) {
        const { start, end } = segments[i];
        const duration = end - start;

        await ffmpeg.exec([
          "-i",
          "input.mp4",
          "-ss",
          start.toString(),
          "-t",
          duration.toString(),
          "-c",
          "copy",
          `output${i + 1}.mp4`,
        ]);

        const data = await ffmpeg.readFile(`output${i + 1}.mp4`);
        const url = URL.createObjectURL(
          new Blob([data.buffer], { type: "video/mp4" })
        );

        const a = document.createElement("a");
        a.href = url;
        a.download = `segment_${i + 1}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        await ffmpeg.deleteFile(`output${i + 1}.mp4`);
      }

      await ffmpeg.deleteFile("input.mp4");
      setSegments([
        { start: 0, end: 0 },
        { start: 0, end: 0 },
        { start: 0, end: 0 },
      ]);
      setVideoFile(null);
      setVideoUrl("");
      setDuration(0);
    } catch (error) {
      console.error("Error:", error);
      alert(`Error processing video: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Video Trimmer</h1>

      <div className="mb-4">
        <label
          htmlFor="file-upload"
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg cursor-pointer transition-colors 
      ${
        isProcessing
          ? "bg-gray-300 text-gray-500 cursor-not-allowed"
          : "bg-blue-600 hover:bg-blue-700 text-white"
      }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12v9m0 0l-3-3m3 3l3-3m0-6V6a2 2 0 00-2-2H9a2 2 0 00-2 2v6"
            />
          </svg>
          <span>{videoFile ? "Change Video File" : "Upload Video File"}</span>
        </label>
        <input
          id="file-upload"
          type="file"
          accept="video/*"
          onChange={handleFileChange}
          disabled={isProcessing}
          className="hidden"
        />
      </div>

      {videoUrl && (
        <div className="mb-6">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onLoadedMetadata={handleLoadedMetadata}
            className="w-full mb-2"
          />
          <div className="text-sm text-gray-600">
            Duration: {formatTime(duration)}
          </div>
        </div>
      )}

      <div className="space-y-4 mb-6">
        {segments.map((segment, index) => (
          <div key={index} className="border p-4 rounded">
            <h3 className="font-medium mb-2">Segment {index + 1}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time (seconds)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={segment.start}
                  onChange={(e) =>
                    handleSegmentChange(index, "start", e.target.value)
                  }
                  className="w-full p-2 border rounded"
                  disabled={isProcessing}
                />
                <div className="text-sm text-gray-500">
                  {formatTime(segment.start)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time (seconds)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={segment.end}
                  onChange={(e) =>
                    handleSegmentChange(index, "end", e.target.value)
                  }
                  className="w-full p-2 border rounded"
                  disabled={isProcessing}
                />
                <div className="text-sm text-gray-500">
                  {formatTime(segment.end)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isProcessing && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-1">Processing: {progress}%</p>
        </div>
      )}

      <button
        onClick={handleTrimAndDownload}
        disabled={!videoFile || isProcessing}
        className={`px-4 py-2 rounded ${
          !videoFile || isProcessing
            ? "bg-gray-300 text-gray-500"
            : "bg-blue-600 text-white"
        }`}
      >
        {isProcessing ? "Processing..." : "Trim and Download Segments"}
      </button>
    </div>
  );
}

export default App;

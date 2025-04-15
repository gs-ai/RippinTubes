![c4394cac-a6d6-4c1f-9286-2981e7af1e06](https://github.com/user-attachments/assets/314a559c-c3d8-4726-9af8-e55eba7df552)


[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) [![Node.js](https://img.shields.io/badge/Node.js-v14%2B-brightgreen)](https://nodejs.org/) [![Python](https://img.shields.io/badge/Python-3.x-blue)](https://www.python.org/)

# RippinTubes

## Why Use This Tool?
RippinTubes is a powerful and efficient tool for extracting YouTube transcripts, making it ideal for researchers, content creators, and developers looking to analyze video content or train language models.

## Overview
The YouTube Transcript Crawler is a Node.js-based tool designed to scrape transcripts from YouTube videos. It starts with a specified YouTube profile handle, processes videos to fetch their transcripts, and saves them in a structured format in the `TRANSCRIPTIONS` directory. The program ensures no duplicate transcripts are downloaded, even if restarted.

## Features
- Fetches transcripts directly using the `youtube-transcript-api`.
- Skips videos with existing transcripts to avoid duplicates.
- Crawls related YouTube channels for additional transcripts.
- Implements random delays between requests to avoid overloading servers.
- Saves transcripts with filenames that include the video name and timestamp.

## Requirements
- Node.js (v14 or later)
- Python 3.x
- `youtube-transcript-api` Python library
- Puppeteer with stealth plugin

## Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/gs-ai/RippinTubes.git
   cd RippinTubes
   ```
2. Install Node.js dependencies:
   ```bash
   npm install
   ```
3. Install Python dependencies:
   ```bash
   pip install youtube-transcript-api
   ```

## Usage
1. Run the program:
   ```bash
   node rippintubes.js
   ```
2. Enter the YouTube profile handle when prompted (e.g., `@someyoutubechannel`).
3. The program will fetch transcripts and save them in the `TRANSCRIPTIONS` directory.

## Configuration
- The program uses a random delay between 11 and 73 seconds between requests to avoid overloading servers.
- By default, it processes up to 100 videos per channel. This limit can be adjusted in the `maxVideos` variable in the code.

## Notes
- Ensure you have a valid YouTube API key set in your environment variables if using the YouTube API for additional features.
- The program skips videos without available transcripts.

## Directory Structure
```
RippinTubes/
├── rippintubes.js
├── TRANSCRIPTIONS/
```

## Additional Features
- **Related Channels Crawling**: Fetches related YouTube channels for additional transcripts.
- **Consolidation**: Consolidates all transcript files into a single JSONL file for easier processing.

## Example Usage
### Consolidating Transcripts
The program can consolidate all transcript files into a single JSONL file for easier processing. This is done automatically at the end of the script execution.

The consolidated file is saved as `consolidated_transcripts.jsonl` in the root directory.

## Graceful Termination
If the program is terminated early (e.g., via `Ctrl+C`), it will complete the current transcript download before exiting. This ensures that no partially downloaded transcripts are left incomplete.

## Coming Soon
### Cleaning and Parsing Transcripts for LLM Training
We are working on adding a guide and tools to clean and parse the transcript data into a structured JSONL format. This will make it easier to use the data for training large language models (LLMs). Stay tuned for updates!

## Contributing
We welcome contributions! To get started:
1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Submit a pull request with a clear description of your changes.

For more details, see our `CONTRIBUTING.md` file.

## License
This project is licensed under the MIT License.

## GitHub Pages
Check out our [GitHub Pages site](https://gs-ai.github.io/RippinTubes/) for detailed documentation and examples.

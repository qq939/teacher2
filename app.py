from flask import Flask, render_template, request, jsonify
import logging
import os
from assistant import assistant

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/history')
def history_page():
    return render_template('history.html')

@app.route('/api/history', methods=['GET'])
def get_history():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    data = assistant.get_history(start_date, end_date)
    return jsonify(data)

@app.route('/open/api/analyz', methods=['POST'])
def open_api_analyze():
    data = request.get_json(force=True, silent=True) or {}
    sentence = data.get('sentence', '')
    return render_template('index.html', auto_sentence=sentence)

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.json
    sentence = data.get('sentence')
    if not sentence:
        return jsonify({"error": "No sentence provided"}), 400
    
    result = assistant.analyze_sentence(sentence)
    print(result, flush=True)
    return jsonify(result)



@app.route('/api/submit_quiz', methods=['POST'])
def submit_quiz():
    data = request.json
    if not data:
        return jsonify({"error": "No data provided"}), 400
        
    result = assistant.submit_quiz_result(data)
    return jsonify(result)



import threading

def run_http():
    logger.info("Starting HTTP server on port 5010")
    app.run(host='0.0.0.0', port=5010, debug=False, threaded=True)

def run_https():
    cert_path = os.path.join(os.path.dirname(__file__), 'cert', 'cert.pem')
    key_path = os.path.join(os.path.dirname(__file__), 'cert', 'key.pem')
    if os.path.exists(cert_path) and os.path.exists(key_path):
        ssl_ctx = (cert_path, key_path)
        logger.info("Starting HTTPS server on port 5011")
        app.run(host='0.0.0.0', port=5011, debug=False, threaded=True, ssl_context=ssl_ctx)
    else:
        logger.warning("SSL certificates not found, skipping HTTPS server")

if __name__ == '__main__':
    # Start HTTPS in a separate thread
    https_thread = threading.Thread(target=run_https)
    https_thread.start()
    
    # Run HTTP in main thread
    run_http()

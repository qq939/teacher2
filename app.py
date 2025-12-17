from flask import Flask, render_template, request, jsonify, redirect, url_for
import logging
import os
from assistant import assistant

app = Flask(__name__)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.route('/')
def index():
    auto_sentence = request.args.get('auto_sentence')
    return render_template('index.html', auto_sentence=auto_sentence)

@app.route('/history')
def history_page():
    return render_template('history.html')

@app.route('/api/history', methods=['GET'])
def get_history():
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    data = assistant.get_history(start_date, end_date)
    return jsonify(data)

@app.route('/api/check_history', methods=['GET'])
def check_history():
    return jsonify(assistant.check_history())

@app.route('/api/delete_word', methods=['POST'])
def delete_word():
    data = request.get_json(force=True, silent=True) or {}
    word = data.get('word', '')
    dry_run = bool(data.get('dry_run', False))
    result = assistant.delete_word_from_history(word, dry_run=dry_run)
    status = 200 if result.get('status') == 'success' else 400
    return jsonify(result), status

@app.route('/open/api/analyz', methods=['POST'])
def open_api_analyze():
    data = request.get_json(force=True, silent=True) or {}
    sentence = data.get('sentence', '')
    sentence = sentence.strip().replace(r'\n', '').replace(r'\r', '')
    sentence = sentence.replace(r'\\', r'')
    sentence = sentence.replace(r'\"', r'"')
    sentence = sentence.replace(r'\\n', r'\n')
    sentence = sentence.replace(r'\\t', r'\t')
    sentence = sentence.replace(r'\\s', r'\s')
    sentence_url_encoded = sentence.replace(r'\n', r'%0A').replace(r'\t', r'%09').replace(r'\s', r'%20')

    return "http://teacher.dimond.top/analyze?sentence=" + sentence_url_encoded

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



if __name__ == '__main__':
    cert_path = os.path.join(os.path.dirname(__file__), 'cert', 'cert.pem')
    key_path = os.path.join(os.path.dirname(__file__), 'cert', 'key.pem')
    ssl_ctx = None
    if os.path.exists(cert_path) and os.path.exists(key_path):
        ssl_ctx = (cert_path, key_path)
    app.run(host='0.0.0.0', port=5010, debug=False)

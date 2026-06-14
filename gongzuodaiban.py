# Python (Flask) 示例

from flask import Flask, request, jsonify

app = Flask(__name__)

tasks = []

@app.route('/tasks', methods=['GET'])
def get_tasks():
    return jsonify(tasks)

@app.route('/tasks', methods=['POST'])
def create_task():
    data = request.get_json()
    task = {
        'id': len(tasks) + 1,
        'name': data['name'],
        'description': data['description'],
        'due_date': data['due_date']
    }
    tasks.append(task)
    return jsonify(task)

if __name__ == '__main__':
    app.run(debug=True)




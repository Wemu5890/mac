import os
import uuid
import tempfile
import threading
import webbrowser
import socket
from flask import Flask, request, jsonify, send_file, send_from_directory
import openpyxl
import json
import urllib.request
import subprocess

import sys

def get_base_path():
    """获取程序运行时的绝对路径（兼容 PyInstaller 单文件解压路径）"""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.abspath(".")

base_path = get_base_path()

# 初始化 Flask，并将动态路径设为静态文件目录
app = Flask(__name__, static_folder=base_path, static_url_path='')
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()

# 存储 sessionId 与本地文件的映射
SESSION_FILES = {}

# 自动更新配置参数 (需替换为您真实的 GitHub 信息)
CURRENT_VERSION = "v1.0.0"
GITHUB_API_URL = "https://api.github.com/repos/Wemu5890/mac/releases/latest"

@app.route('/api/check_update')
def check_update():
    try:
        req = urllib.request.Request(GITHUB_API_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            latest_version = data.get('tag_name', '')
            download_url = ''
            if 'assets' in data and len(data['assets']) > 0:
                is_mac = sys.platform == 'darwin'
                for asset in data['assets']:
                    name = asset['name'].lower()
                    if is_mac and ('mac' in name or name.endswith('.zip') or name.endswith('.dmg')):
                        download_url = asset['browser_download_url']
                        break
                    elif not is_mac and name.endswith('.exe'):
                        download_url = asset['browser_download_url']
                        break
            
            # 简单的版本比较
            has_update = bool(latest_version and latest_version > CURRENT_VERSION)
            
            return jsonify({
                "current_version": CURRENT_VERSION,
                "latest_version": latest_version,
                "has_update": has_update,
                "download_url": download_url,
                "release_notes": data.get('body', '')
            })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/do_update', methods=['POST'])
def do_update():
    data = request.json
    download_url = data.get('download_url')
    if not download_url:
        return jsonify({"error": "缺少下载链接"}), 400
        
    try:
        # 根据系统确定临时文件名
        is_mac = sys.platform == 'darwin'
        ext = ".zip" if is_mac else ".exe"
        installer_path = os.path.join(tempfile.gettempdir(), f"update_package{ext}")
        
        req = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as response, open(installer_path, 'wb') as out_file:
            out_file.write(response.read())
            
        # 启动安装程序（分离进程）
        if is_mac:
            # macOS: 打开下载的压缩包或 DMG，提示用户覆盖
            subprocess.Popen(['open', installer_path])
            threading.Timer(0.5, lambda: os._exit(0)).start()
        elif os.name == 'nt':
            # Windows: 启动 setup.exe (静默安装) 并退出当前程序
            subprocess.Popen([installer_path, '/SILENT', '/SP-'], creationflags=subprocess.CREATE_NEW_CONSOLE | subprocess.CREATE_NEW_PROCESS_GROUP)
            # 延时一点退出，保证子进程启动
            threading.Timer(0.5, lambda: os._exit(0)).start()
            
        return jsonify({"message": "更新下载完成，即将自动重启覆盖安装！"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/')
def index():
    return send_from_directory(base_path, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(base_path, path)

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "没有收到文件"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "未选择文件"}), 400
        
    session_id = str(uuid.uuid4())
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_{file.filename}")
    file.save(file_path)
    SESSION_FILES[session_id] = file_path
    
    try:
        # data_only=True 获取公式计算后的实际值用于前端显示
        wb = openpyxl.load_workbook(file_path, data_only=True)
        ws = wb.active
        
        headerRowIndex = -1
        headerRowData = []
        bodyData = []
        
        # 查找表头
        for row in ws.iter_rows():
            found = False
            for cell in row:
                val = str(cell.value) if cell.value is not None else ""
                if '编号' in val or '姓名' in val:
                    found = True
                    break
            if found:
                headerRowIndex = row[0].row
                # openpyxl 的 column 索引从 1 开始
                headerRowData = [""] * (ws.max_column + 1)
                for cell in row:
                    headerRowData[cell.column] = str(cell.value).strip() if cell.value is not None else ""
                break
                
        if headerRowIndex == -1:
            return jsonify({"error": "未能识别出包含“教师编号”或“姓名”的表头行，请检查文件格式"}), 400
            
        idIndex = -1
        nameIndex = -1
        for i, h in enumerate(headerRowData):
            if '编号' in h: idIndex = i
            if '姓名' in h: nameIndex = i
            
        # 遍历数据行
        for row in ws.iter_rows(min_row=headerRowIndex + 1):
            rowArr = [""] * (ws.max_column + 1)
            for cell in row:
                if cell.value is not None:
                    # 日期格式兼容处理
                    if hasattr(cell.value, 'strftime'):
                        rowArr[cell.column] = cell.value.strftime('%Y/%m/%d')
                    else:
                        rowArr[cell.column] = str(cell.value).strip()
            
            valId = rowArr[idIndex] if idIndex > 0 else ""
            valName = rowArr[nameIndex] if nameIndex > 0 else ""
            
            hasId = bool(valId and valId.strip())
            hasName = bool(valName and valName.strip())
            
            if idIndex == -1 and nameIndex == -1:
                if any(c.strip() for c in rowArr):
                    bodyData.append({"excelRowNumber": row[0].row, "cells": rowArr})
            elif hasId or hasName:
                bodyData.append({"excelRowNumber": row[0].row, "cells": rowArr})
                
        return jsonify({
            "sessionId": session_id,
            "headerRowData": headerRowData,
            "bodyData": bodyData
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/export', methods=['POST'])
def export_file():
    data = request.json
    session_id = data.get('sessionId')
    updates = data.get('updates', [])
    
    if not session_id or session_id not in SESSION_FILES:
        return jsonify({"error": "会话无效或文件已过期，请重新上传！"}), 400
        
    file_path = SESSION_FILES[session_id]
    
    try:
        # 在应用更改时，不使用 data_only=True 以完美保留原有公式、格式、批注和样式
        wb = openpyxl.load_workbook(file_path)
        ws = wb.active
        
        for update in updates:
            r = int(update['excelRowNumber'])
            c = int(update['colNum'])
            val = update['value']
            
            # 智能转换数字类型
            if val.strip() and val.strip().replace('.', '', 1).isdigit():
                try:
                    val = float(val) if '.' in val else int(val)
                except ValueError:
                    pass
            ws.cell(row=r, column=c, value=val)
            
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], f"updated_{session_id}.xlsx")
        wb.save(output_path)
        
        return send_file(
            output_path, 
            as_attachment=True, 
            download_name="已更新数据.xlsx",
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return s.getsockname()[1]

if __name__ == '__main__':
    port = find_free_port()
    url = f"http://127.0.0.1:{port}"
    print(f"==========================================")
    print(f"卓越 Excel 更新工具服务端已启动！")
    print(f"正在浏览器中打开: {url}")
    print(f"==========================================")
    
    # 延迟 1.5 秒自动打开浏览器
    threading.Timer(1.5, lambda: webbrowser.open_new(url)).start()
    
    # 启动 Flask 服务器
    app.run(host='127.0.0.1', port=port, debug=False)

const requiredFields = [
    '教师编号', '姓名', '手机号码', '所教学科', '所教年级', '所教行政班级', '所教教学班级'
];

let globalWorkbook = null;
let globalWorksheet = null;
let headerRowIndex = -1;
let headerRowData = [];
let bodyData = [];

function showLoading(text) {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

async function checkForUpdates() {
    try {
        const response = await fetch('/api/check_update');
        const data = await response.json();
        if (data.has_update) {
            const modal = document.getElementById('update-modal');
            const msg = document.getElementById('update-message');
            const btnConfirm = document.getElementById('btn-confirm-update');
            const btnCancel = document.getElementById('btn-cancel-update');
            
            msg.textContent = `发现新版本 ${data.latest_version}，是否立即更新？`;
            modal.classList.remove('hidden');
            
            btnCancel.onclick = () => modal.classList.add('hidden');
            btnConfirm.onclick = async () => {
                btnConfirm.disabled = true;
                btnConfirm.textContent = '正在下载...';
                try {
                    const res = await fetch('/api/do_update', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({download_url: data.download_url})
                    });
                    const resData = await res.json();
                    if (resData.error) throw new Error(resData.error);
                    btnConfirm.textContent = '即将重启...';
                } catch (e) {
                    alert('更新失败: ' + e.message);
                    btnConfirm.disabled = false;
                    btnConfirm.textContent = '重试';
                }
            };
        }
    } catch (e) {
        console.log('检查更新失败', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    checkForUpdates();

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    document.getElementById('btn-batch-apply').addEventListener('click', handleBatchApply);
    document.getElementById('btn-export').addEventListener('click', handleExport);

    const btnParseText = document.getElementById('btn-parse-text');
    const pasteInput = document.getElementById('paste-input');
    if (btnParseText && pasteInput) {
        btnParseText.addEventListener('click', () => {
            const text = pasteInput.value.trim();
            if (!text) {
                alert('请先在文本框内粘贴需要识别的数据！');
                return;
            }
            const lines = text.split('\n').map(l => l.replace(/\s+/g, ''));
            parseTextAndFill(lines, text);
            pasteInput.value = '';
        });
    }

    // 初始化操作引导
    const driver = window.driver.js.driver;
    const tour = driver({
        showProgress: true,
        animate: true,
        doneBtnText: '我知道了',
        closeBtnText: '关闭',
        nextBtnText: '下一步 &rarr;',
        prevBtnText: '&larr; 上一步',
        steps: [
            {
                element: '#drop-zone',
                popover: {
                    title: '第一步：导入表格',
                    description: '将需要处理的 Excel 文件拖拽到这里，或者点击选择文件。系统会瞬间完成解析。',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '.text-parse-tools',
                popover: {
                    title: '第二步：文本智能填入',
                    description: '把提取好的纯文本（含姓名和手机号）粘贴到输入框，点击“识别并填入”，系统会自动匹配表格并补全班级信息。',
                    side: 'bottom',
                    align: 'start'
                }
            },
            {
                element: '#table-head-row',
                popover: {
                    title: '第三步：一键整列修改',
                    description: '当表格渲染出来后，你可以直接点击这里的任意【表头】（例如“所教学科”），即可呼出弹窗，将整个列快速刷成同一个值。',
                    side: 'bottom',
                    align: 'center'
                }
            },
            {
                element: '#btn-export',
                popover: {
                    title: '第四步：导出成片',
                    description: '确认数据全部更新无误后，点击这里即可导出最新的 Excel 文件，原生样式会被 100% 保留！',
                    side: 'left',
                    align: 'center'
                }
            }
        ]
    });

    // 绑定点击事件
    const btnGuide = document.getElementById('btn-start-guide');
    if (btnGuide) {
        btnGuide.addEventListener('click', () => {
            tour.drive();
        });
    }

    // 表格实时全局筛选功能
    const tableFilterInput = document.getElementById('global-table-filter');
    if (tableFilterInput) {
        tableFilterInput.addEventListener('input', function(e) {
            // 获取用户输入的关键字并转为小写
            const searchTerm = e.target.value.toLowerCase().trim();
            // 获取表格主体中的所有数据行
            const tableRows = document.querySelectorAll('#table-body tr'); 
            
            tableRows.forEach(row => {
                // 将整行的文本内容提取并转小写
                const rowText = row.textContent.toLowerCase();
                // 如果整行文本包含关键字，则显示；否则使用 display: none 隐藏
                if (rowText.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    // 绑定隐藏的 file input 导入更新功能
    const btnUpdateExcel = document.getElementById('btn-update-from-excel');
    const updateFileInput = document.getElementById('update-file-input');
    
    if (btnUpdateExcel && updateFileInput) {
        btnUpdateExcel.addEventListener('click', () => updateFileInput.click());
        updateFileInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const file = e.target.files[0];
            showLoading('正在极速解析更新表格...');
            
            const formData = new FormData();
            formData.append('file', file);

            try {
                // 复用后端极速解析接口
                const response = await fetch('/api/upload', { method: 'POST', body: formData });
                const result = await response.json();
                
                if (result.error) throw new Error(result.error);
                
                const newHeaders = result.headerRowData;
                const newData = result.bodyData;

                // 1. 智能模糊识别新表的列号
                let newNameCol = -1, newPhoneCol = -1, newSubjectCol = -1, newGradeCol = -1, newClassCol = -1, newRoleCol = -1;
                newHeaders.forEach((h, i) => {
                    const text = String(h || '').trim();
                    if (text.includes('姓名') || text === '老师') newNameCol = i;
                    else if (text.includes('手机') || text.includes('电话')) newPhoneCol = i;
                    else if (text.includes('学科') && !text.includes('是否')) newSubjectCol = i;
                    else if (text.includes('年级') && !text.includes('是否')) newGradeCol = i;
                    else if (text.includes('班级') && !text.includes('是否')) newClassCol = i;
                    else if (text.includes('角色') || text.includes('管理员')) newRoleCol = i;
                });

                if (newNameCol === -1 && newPhoneCol === -1) {
                    alert('匹配失败：更新的表格中未找到“姓名”或“手机”列，无法进行身份比对！');
                    hideLoading();
                    return;
                }

                // 2. 遍历当前 DOM 表格进行精准覆盖
                const tableRows = document.querySelectorAll('#table-body tr');
                let updateCount = 0;

                tableRows.forEach(tr => {
                    let currName = '', currPhone = '';
                    const ths = document.querySelectorAll('#table-head-row th');
                    ths.forEach((th, idx) => {
                        if (th.textContent.includes('姓名')) currName = (tr.cells[idx]?.textContent || '').trim();
                        if (th.textContent.includes('手机')) currPhone = (tr.cells[idx]?.textContent || '').trim();
                    });

                    // 在新数据中寻找匹配的人（优先手机号，其次姓名）
                    const matchedRowObj = newData.find(rowObj => {
                        const row = rowObj.cells;
                        const rowName = newNameCol !== -1 ? String(row[newNameCol] || '').trim() : '';
                        const rowPhone = newPhoneCol !== -1 ? String(row[newPhoneCol] || '').trim() : '';
                        if (currPhone && rowPhone && currPhone === rowPhone) return true;
                        if (currName && rowName && currName === rowName) return true;
                        return false;
                    });

                    if (matchedRowObj) {
                        const matchedRow = matchedRowObj.cells;
                        let rowUpdated = false;
                        
                        // 定位当前DOM的列索引用于回写
                        let domSubjIdx=-1, domGradeIdx=-1, domClassIdx=-1, domAdminIdx=-1;
                        ths.forEach((th, idx) => {
                            const t = th.textContent.trim();
                            if (t.includes('学科') && !t.includes('是否')) domSubjIdx = idx;
                            if (t.includes('年级') && !t.includes('是否')) domGradeIdx = idx;
                            if (t.includes('行政班级') || t === '班级') domClassIdx = idx;
                            if (t.includes('是否管理员') || t === '角色') domAdminIdx = idx;
                        });

                        // 填入数据并执行简单的清洗过滤
                        if (newSubjectCol !== -1 && domSubjIdx !== -1 && matchedRow[newSubjectCol]) {
                            let val = matchedRow[newSubjectCol].toString();
                            if (val !== '全部学科') { tr.cells[domSubjIdx].textContent = val; rowUpdated = true; }
                        }
                        if (newGradeCol !== -1 && domGradeIdx !== -1 && matchedRow[newGradeCol]) {
                            let val = matchedRow[newGradeCol].toString();
                            if (val !== '全部年级') { tr.cells[domGradeIdx].textContent = val; rowUpdated = true; }
                        }
                        if (newClassCol !== -1 && domClassIdx !== -1 && matchedRow[newClassCol]) {
                            let val = matchedRow[newClassCol].toString().replace(/[oO]/ig, '0').replace('班', '');
                            if (val !== '全部') { tr.cells[domClassIdx].textContent = val; rowUpdated = true; }
                        }
                        if (newRoleCol !== -1 && domAdminIdx !== -1 && matchedRow[newRoleCol]) {
                            let val = matchedRow[newRoleCol].toString();
                            if (val.includes('管理员') || val === '是') {
                                tr.cells[domAdminIdx].textContent = ths[domAdminIdx].textContent === '角色' ? '管理员' : '是';
                                rowUpdated = true;
                            }
                        }

                        if (rowUpdated) {
                            tr.style.transition = 'background-color 0.5s';
                            tr.style.backgroundColor = '#dcfce3'; // 绿色高亮
                            setTimeout(() => tr.style.backgroundColor = '', 3000);
                            updateCount++;
                        }
                    }
                });

                updateFileInput.value = ''; // 清空选择，允许重复传同名文件
                alert(`比对完成！成功利用新表格更新了 ${updateCount} 名教师的数据。`);
            } catch (err) {
                alert('解析更新表格失败：' + err.message);
            } finally {
                hideLoading();
            }
        });
    }
});

let currentSessionId = null;

async function handleFile(file) {
    showLoading('正在上传并解析 Excel 文件，请稍候...');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || '上传失败');
        }
        
        currentSessionId = data.sessionId;
        headerRowData = data.headerRowData;
        bodyData = data.bodyData;
        
        renderWorkspace(headerRowData, bodyData);
        
        document.getElementById('upload-section').classList.add('hidden');
        document.getElementById('workspace-section').classList.remove('hidden');
        
        // --- 智能异常检测 ---
        let idColNum = -1, phoneColNum = -1;
        headerRowData.forEach((h, i) => {
            const txt = String(h || '').trim();
            if (txt.includes('编号')) idColNum = i;
            if (txt.includes('手机') || txt.includes('电话')) phoneColNum = i;
        });
        
        let duplicateIds = 0, invalidPhones = 0;
        const idSet = new Set();
        
        const tableRows = document.querySelectorAll('#table-body tr');
        tableRows.forEach(tr => {
            let isRowError = false;
            if (idColNum !== -1) {
                const idCell = tr.querySelector(`td[data-col-num="${idColNum}"]`);
                if (idCell) {
                    const idVal = idCell.textContent.trim();
                    if (idVal) {
                        if (idSet.has(idVal)) { duplicateIds++; isRowError = true; }
                        else { idSet.add(idVal); }
                    }
                }
            }
            if (phoneColNum !== -1) {
                const phoneCell = tr.querySelector(`td[data-col-num="${phoneColNum}"]`);
                if (phoneCell) {
                    const phoneVal = phoneCell.textContent.trim();
                    if (!phoneVal || !/^\d{11}$/.test(phoneVal)) { invalidPhones++; isRowError = true; }
                }
            }
            if (isRowError) tr.style.backgroundColor = '#FEF08A';
        });
        
        let notifyCard = document.getElementById('status-notification-card');
        if (!notifyCard) {
            notifyCard = document.createElement('div');
            notifyCard.id = 'status-notification-card';
            notifyCard.style.padding = '12px 20px';
            notifyCard.style.borderRadius = '12px';
            notifyCard.style.marginBottom = '15px';
            notifyCard.style.fontWeight = '500';
            notifyCard.style.fontSize = '14px';
            notifyCard.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
            const workspaceTopBar = document.querySelector('.workspace-top-bar');
            workspaceTopBar.parentNode.insertBefore(notifyCard, workspaceTopBar);
        }
        
        if (duplicateIds === 0 && invalidPhones === 0) {
            notifyCard.style.backgroundColor = '#ecfdf5';
            notifyCard.style.color = '#065f46';
            notifyCard.style.border = '1px solid #10b981';
            notifyCard.textContent = `✅ 已成功加载并识别 ${bodyData.length} 条教师数据，一切正常。`;
        } else {
            notifyCard.style.backgroundColor = '#fff7ed';
            notifyCard.style.color = '#9a3412';
            notifyCard.style.border = '1px solid #f97316';
            notifyCard.textContent = `✅ 成功识别 ${bodyData.length} 条数据。⚠️ 发现异常：${invalidPhones} 名教师手机号缺失/格式错误，${duplicateIds} 个教师编号重复。`;
        }
        
    } catch (err) {
        alert('解析失败: ' + err.message);
    } finally {
        hideLoading();
    }
}

function renderWorkspace(headers, body) {
    const headRow = document.getElementById('table-head-row');
    const tbody = document.getElementById('table-body');
    const batchColumnSelect = document.getElementById('batch-column');
    
    headRow.innerHTML = '';
    tbody.innerHTML = '';
    batchColumnSelect.innerHTML = '<option value="">-- 选择要批量更新的列 --</option>';

    const selectAllTh = document.createElement('th');
    const selectAllCb = document.createElement('input');
    selectAllCb.type = 'checkbox';
    selectAllCb.id = 'select-all';
    selectAllCb.addEventListener('change', (e) => {
        const checkboxes = tbody.querySelectorAll('.row-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
        updateSelectedCount();
    });
    selectAllTh.appendChild(selectAllCb);
    headRow.appendChild(selectAllTh);

    for (let colNum = 1; colNum < headers.length; colNum++) {
        const header = headers[colNum];
        if (header === undefined) continue;
        
        const th = document.createElement('th');
        th.textContent = header;
        
        // 增加交互样式
        th.style.cursor = 'pointer';
        th.title = `点击统一修改全表【${header}】列`;
        
        // 绑定点击整列覆盖事件
        th.addEventListener('click', () => {
            const newValue = prompt(`请输入你要为【${header}】统一设置的值：\n(确认后将应用到该列所有行。留空则清空该列，点击取消则放弃修改)`);
            
            // newValue 为 null 代表用户点击了取消
            if (newValue !== null) {
                const tbody = document.getElementById('table-body');
                const rows = tbody.querySelectorAll('tr');
                rows.forEach(tr => {
                    const td = tr.querySelector(`td[data-col-num="${colNum}"]`);
                    if (td) {
                        td.textContent = newValue;
                        
                        // 增加修改成功后的渐变高亮反馈
                        td.style.transition = 'background-color 0.5s';
                        td.style.backgroundColor = '#dcfce3';
                        setTimeout(() => td.style.backgroundColor = '', 1500);
                    }
                });
            }
        });
        
        if (requiredFields.includes(String(header).trim()) || String(header).includes('标红')) {
            th.classList.add('required-header');
        }
        headRow.appendChild(th);

        if (header && String(header).trim() !== '') {
            const option = document.createElement('option');
            option.value = colNum; 
            option.textContent = header;
            batchColumnSelect.appendChild(option);
        }
    }

    body.forEach((rowData) => {
        const tr = document.createElement('tr');
        tr.dataset.excelRow = rowData.excelRowNumber;

        const tdCb = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'row-checkbox';
        cb.addEventListener('change', updateSelectedCount);
        tdCb.appendChild(cb);
        tr.appendChild(tdCb);

        for (let colNum = 1; colNum < headers.length; colNum++) {
            if (headers[colNum] === undefined) continue;
            const td = document.createElement('td');
            td.textContent = rowData.cells[colNum] || '';
            td.contentEditable = "true";
            td.dataset.colNum = colNum; 
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    });

    document.getElementById('row-count').textContent = `总行数: ${body.length}`;
    updateSelectedCount();
}

function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    const selectedCount = checkboxes.length;
    document.getElementById('selected-count').textContent = `已选: ${selectedCount}`;
    
    const batchTools = document.querySelector('.batch-tools');
    if (batchTools) {
        if (selectedCount > 0) {
            batchTools.style.display = 'flex';
            let msgSpan = document.getElementById('batch-selected-msg');
            if (!msgSpan) {
                msgSpan = document.createElement('span');
                msgSpan.id = 'batch-selected-msg';
                msgSpan.style.marginRight = '10px';
                msgSpan.style.color = '#2563EB';
                msgSpan.style.fontWeight = 'bold';
                batchTools.insertBefore(msgSpan, batchTools.firstChild);
            }
            msgSpan.textContent = `已选择 ${selectedCount} 项`;
        } else {
            batchTools.style.display = 'none';
        }
    }
}

function handleBatchApply() {
    const colNum = document.getElementById('batch-column').value;
    const newValue = document.getElementById('batch-value').value;

    if (colNum === '') {
        alert('请选择要批量更新的列');
        return;
    }

    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    if (checkboxes.length === 0) {
        alert('请在表格中勾选要更新的行');
        return;
    }

    checkboxes.forEach(cb => {
        const tr = cb.closest('tr');
        const td = tr.querySelector(`td[data-col-num="${colNum}"]`);
        if (td) {
            td.textContent = newValue;
        }
    });

    alert(`成功更新了 ${checkboxes.length} 行数据！`);
}

async function handleExport() {
    if (!currentSessionId) {
        alert('无有效会话，请重新上传文件！');
        return;
    }

    showLoading('正在保存并导出带原生样式的 Excel 文件，请稍候...');
    
    const tbody = document.getElementById('table-body');
    const updates = [];
    
    for (let row of tbody.children) {
        const excelRowNumber = parseInt(row.dataset.excelRow);
        const tds = row.querySelectorAll('td[data-col-num]');
        tds.forEach(td => {
            updates.push({
                excelRowNumber: excelRowNumber,
                colNum: parseInt(td.dataset.colNum),
                value: td.textContent
            });
        });
    }
    
    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: currentSessionId,
                updates: updates
            })
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || '导出失败');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = '已更新数据.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
    } catch (err) {
        alert('导出失败: ' + err.message);
    } finally {
        hideLoading();
    }
}



// ---------------- Text Parsing Logic ----------------

function parseTextAndFill(lines, rawText) {
    let nameColNum = -1;
    let phoneColNum = -1;
    let gradeColNum = -1;
    let adminClassColNum = -1;
    let subjectColNum = -1;
    let isAdminColNum = -1;

    for (let i = 1; i < headerRowData.length; i++) {
        const headerText = String(headerRowData[i] || '').replace(/\s+/g, '');
        if (headerText.includes('姓名')) nameColNum = i;
        else if (headerText.includes('手机')) phoneColNum = i;
        else if (headerText.includes('年级') && !headerText.includes('是否')) gradeColNum = i;
        else if (headerText.includes('行政班级') || (headerText === '班级' && adminClassColNum === -1)) adminClassColNum = i;
        else if (headerText.includes('学科') && !headerText.includes('是否')) subjectColNum = i;
        else if (headerText.includes('是否管理员') || headerText === '角色') isAdminColNum = i;
    }

    if (phoneColNum === -1 && nameColNum === -1) {
        alert('当前表格中没有找到包含“姓名”或“手机”的列，无法匹配数据！');
        return;
    }

    const tbody = document.getElementById('table-body');
    const trs = Array.from(tbody.children);

    function appendText(td, text) {
        if (!td || !text) return;
        const existing = td.textContent || '';
        if (existing) {
            // 兼容处理：把原有的中文顿号或中文逗号统一当成英文逗号处理
            const normalizedExisting = existing.replace(/[、，]/g, ',');
            const parts = normalizedExisting.split(',');
            if (!parts.includes(text)) {
                td.textContent = normalizedExisting + ',' + text;
            }
        } else {
            td.textContent = text;
        }
    }

    const teachers = trs.map(tr => {
        const nameCell = nameColNum !== -1 ? tr.querySelector(`td[data-col-num="${nameColNum}"]`) : null;
        const phoneCell = phoneColNum !== -1 ? tr.querySelector(`td[data-col-num="${phoneColNum}"]`) : null;
        return {
            tr: tr,
            name: nameCell ? String(nameCell.textContent).trim().replace(/\s+/g, '') : '',
            phone: phoneCell ? String(phoneCell.textContent).replace(/\D/g, '') : ''
        };
    }).filter(t => t.name || t.phone);

    let lastTargetTeacher = null;
    let matchedTeacherCount = new Set();

    lines.forEach(lineNoSpaces => {
        let matchedTeacher = teachers.find(t => {
            if (t.phone && t.phone.length === 11) {
                let fuzzyPhoneStr = t.phone.split('').map(char => {
                    if (char === '0') return '[0oO]';
                    if (char === '1') return '[1lI]';
                    if (char === '5') return '[5sS]';
                    if (char === '8') return '[8bB]';
                    if (char === '2') return '[2zZ]';
                    return char;
                }).join('');
                if (lineNoSpaces.match(new RegExp(fuzzyPhoneStr, 'i'))) return true;
                if (lineNoSpaces.includes(t.phone)) return true;
            }
            return false;
        });

        if (!matchedTeacher) {
            matchedTeacher = teachers.find(t => {
                if (t.name && t.name.length >= 2 && lineNoSpaces.includes(t.name)) return true;
                return false;
            });
        }

        if (matchedTeacher) {
            lastTargetTeacher = matchedTeacher;
        } else {
            matchedTeacher = lastTargetTeacher;
        }

        if (!matchedTeacher) return; 
        
        // 【第一步：提取并自动去重】（解决存在多个相同年级/学科的问题）
        let gradeMatch = lineNoSpaces.match(/(全部年级|高中全部|初中全部|九年级|八年级|七年级|六年级|五年级|四年级|三年级|二年级|一年级|高三|高二|高一|初三|初二|初一)/g);
        let gradeList = gradeMatch ? [...new Set(gradeMatch)] : [];

        let subjectMatch = lineNoSpaces.match(/(全部学科|科学|语文|数学|英语|物理|化学|生物|政治|历史|地理|体育|美术|音乐|信息|道法|心理|劳动|劳技|综合|书法|通用技术)/g);
        let subjectList = subjectMatch ? [...new Set(subjectMatch)] : [];

        let classMatch = lineNoSpaces.match(/([0-9oOlIzZsSbB]+班|全部班级)/ig);
        let classList = classMatch ? [...new Set(classMatch.map(c => {
            if (c === '全部班级') return '全部';
            return c.replace(/[oO]/ig, '0').replace(/[lI]/ig, '1').replace(/[zZ]/ig, '2').replace(/[sS]/ig, '5').replace(/[bB]/ig, '8').replace('班', '');
        }))] : [];

        // 【第二步：优先级覆盖】（如果同时存在“全部”和“具体值”，直接剔除“全部”）
        const specificGrades = gradeList.filter(g => !g.includes('全部'));
        if (specificGrades.length > 0) gradeList = specificGrades;

        const specificSubjects = subjectList.filter(s => s !== '全部学科');
        if (specificSubjects.length > 0) subjectList = specificSubjects;

        const specificClasses = classList.filter(c => c !== '全部');
        if (specificClasses.length > 0) classList = specificClasses;

        // 将清洗后的数组转回字符串
        let grade = gradeList.length > 0 ? gradeList.join(',') : null;
        let subject = subjectList.length > 0 ? subjectList.join(',') : null;
        let classes = classList;

        // 识别管理员身份
        const isAdmin = lineNoSpaces.includes('管理员') || (lineNoSpaces.includes('全部年级') && lineNoSpaces.includes('全部班级') && lineNoSpaces.includes('全部学科'));

        // 【致命错误拦截】：如果当前这行文本（例如复制的表头）在表格里根本找不到对应的老师，直接跳过，绝对不能往下执行写入！
        if (!matchedTeacher) {
            return;
        }

        // 【第三步：强制默认值兜底】
        // 只有当身份是管理员，或者文本中明确带有“全部”字眼且被清洗为空时，才赋予兜底数据。防止普通老师的空白数据被错误覆写。
        if (!grade && (isAdmin || lineNoSpaces.includes('全部年级'))) {
            grade = '一年级';
        }
        if (!subject && (isAdmin || lineNoSpaces.includes('全部学科'))) {
            subject = '数学';
        }
        if (classes.length === 0 && (isAdmin || lineNoSpaces.includes('全部班级'))) {
            classes = ['01'];
        }

        if (grade || classes.length > 0 || subject || isAdmin) {
            const tr = matchedTeacher.tr;
            let updated = false;

            if (grade && gradeColNum >= 0 && tr.cells[gradeColNum]) {
                tr.cells[gradeColNum].textContent = grade;
                updated = true;
            }
            if (classes && classes.length > 0 && adminClassColNum >= 0 && tr.cells[adminClassColNum]) {
                tr.cells[adminClassColNum].textContent = classes.join(',');
                updated = true;
            }
            if (subject && subjectColNum >= 0 && tr.cells[subjectColNum]) {
                tr.cells[subjectColNum].textContent = subject;
                updated = true;
            }
            if (isAdmin && isAdminColNum >= 0 && tr.cells[isAdminColNum]) {
                // 如果该列表头是“角色”，则填入“管理员”；否则填入“是”
                const isRoleCol = String(headerRowData[isAdminColNum] || '').replace(/\s+/g, '') === '角色';
                tr.cells[isAdminColNum].textContent = isRoleCol ? '管理员' : '是';
                updated = true;
            }

            if (updated) {
                tr.style.transition = 'background-color 0.5s';
                tr.style.backgroundColor = '#dcfce3';
                setTimeout(() => tr.style.backgroundColor = '', 3000);
                matchedTeacherCount.add(tr);
            }
        }
    });

    if (matchedTeacherCount.size > 0) {
        alert(`文本解析完成！成功根据姓名或手机号智能填入了 ${matchedTeacherCount.size} 名教师的数据。`);
    } else {
        const preview = rawText ? rawText.substring(0, 150).replace(/\n/g, ' ') : '空（未提取到任何文字）';
        alert(`匹配失败！\n\n原因分析：提供的文本中没有找到能与表格里匹配的姓名或手机号，或未包含相关学科班级信息。\n\n解析的文字前150字为：\n${preview}...\n\n请检查粘贴的内容是否有误！`);
    }
}

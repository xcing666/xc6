import io, os
fp = 'social-media.html'
s = io.open(fp, encoding='utf-8').read()

# 找到旧 CSS 块起止
start_pat = '/* 更多业务小分类（紧凑纯文字标签） */'
# 结束：以 .sm-subcat-more { 之前的 } 为界
end_pat = '.sm-subcat-more {'

i_start = s.find(start_pat)
i_end = s.find(end_pat)
if i_start < 0 or i_end < 0 or i_end < i_start:
    print('ERROR: markers not found'); raise SystemExit

# 删除从 i_start 前面的 \n 开始（保留前面的 \n\n 分隔），到 i_end 结束（保留 i_end 开始的 .sm-subcat-more {）
# 找到 i_start 前的 \n\n
back_to_nl = s.rfind('\n\n', 0, i_start)
if back_to_nl < 0:
    back_to_nl = i_start

removed = s[back_to_nl:i_end]
print(f'旧 CSS 块长度: {len(removed)} 字符')
print(f'包含旧 sm-list-btn 定义: {"sm-list-btn {" in removed}')

s = s[:back_to_nl] + s[i_end:]
print(f'清理完成，移除 {len(removed)} 字符')

io.open(fp, 'w', encoding='utf-8').write(s)
print('DONE')
os.remove(__file__)
print('cleaned')
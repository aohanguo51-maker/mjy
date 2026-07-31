#!/bin/bash
# 用 CloudBase CLI 建集合，不需要 SecretId/SecretKey（走 tcb login 的登录态）
ENV_ID="pawmemory-d5gjmq8i444ffb334"

echo "开始创建数据集合..."
for col in users pets memories posts comments likes follows medical bills sms_codes; do
  echo -n "  $col ... "
  if tcb db:createCollection "$col" --envId "$ENV_ID" 2>&1 | grep -qi "success\|已存在\|already"; then
    echo "✅"
  else
    tcb db:createCollection "$col" --envId "$ENV_ID" >/dev/null 2>&1 && echo "✅" || echo "⚠️ 可能已存在"
  fi
done

echo ""
echo "集合创建完成。索引会在首次写入时自动建立。"
echo "查看结果：tcb db:listCollections --envId $ENV_ID"

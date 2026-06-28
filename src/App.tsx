import { useState } from 'react';
import { Form, Input, Select, Button, Card, Tag, Typography, Space, Divider, message } from 'antd';
import { SearchOutlined, RedoOutlined, StarFilled } from '@ant-design/icons';
import { generateNames, getWuxingOptions, matchHomophone, type NameResult, type MatchedPhrase } from './utils/naming';
import './App.css';

const { Title, Text } = Typography;
const { Option } = Select;

function App() {
  const [form] = Form.useForm();
  const [results, setResults] = useState<NameResult[]>([]);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (values: any) => {
    setLoading(true);

    try {
      window.__MAX_REUSE__ = values.maxReuse || 2;

      const names = await generateNames({
        surname: values.surname,
        preferredWuxing: values.wuxing || [],
        tonePattern: values.tonePattern || 'any',
        tonePatternDesc: values.tonePatternDesc
      }, 32);

      if (names.length === 0) {
        message.warning('未找到符合条件的名字组合，请调整筛选条件');
      }

      setResults(names);
      message.success(`成功生成 ${names.length} 个候选名字`);
    } catch (error) {
      message.error('生成失败，请重试');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    form.resetFields();
    setResults([]);
  };

  return (
    <div className="app">
      <div className="app-header">
        <Title level={1}>起名辅助系统</Title>
        <Text type="secondary">基于五行、平仄、吉祥寓意智能取名</Text>
      </div>

      <div className="app-content">
        <Card title="输入条件" className="input-section">
          <Form
            form={form}
            layout="vertical"
            onFinish={handleGenerate}
            initialValues={{
              tonePattern: 'any'
            }}
          >
            <Form.Item
              label="姓氏"
              name="surname"
              rules={[{ required: true, message: '请输入姓氏' }]}
            >
              <Input placeholder="例如：魏、张、李" size="large" />
            </Form.Item>

            <Form.Item
              label="五行喜好（可多选）"
              name="wuxing"
              extra="选择喜欢的五行属性，不选则不限"
            >
              <Select
                mode="multiple"
                placeholder="请选择五行"
                size="large"
                allowClear
              >
                {getWuxingOptions().map(wuxing => (
                  <Option key={wuxing} value={wuxing}>
                    {wuxing}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="平仄模式"
              name="tonePattern"
              extra="选择名字的平仄搭配"
            >
              <Select placeholder="选择平仄模式" size="large" allowClear>
                <Option value="any">不限 - 任意平仄组合</Option>
                <Option value="pingping">平平 - 两字都是平声（1、2声）</Option>
                <Option value="pingze">平仄 - 第一字平声，第二字仄声</Option>
                <Option value="zep ing">仄平 - 第一字仄声，第二字平声</Option>
                <Option value="zeze">仄仄 - 两字都是仄声（3、4声）</Option>
              </Select>
            </Form.Item>

            <Form.Item
              label="平仄描述（可选）"
              name="tonePatternDesc"
              extra="如需精确控制，可输入如'平平仄'等描述"
            >
              <Input placeholder="例如：平平仄、平仄平等" size="large" />
            </Form.Item>

            <Form.Item
              label="最大重复次数"
              name="maxReuse"
              initialValue={2}
              extra="每个字在同一个位置最多出现的次数（默认2次）"
            >
              <Select size="large">
                <Option value={1}>1次 - 严格去重</Option>
                <Option value={2}>2次 - 平衡模式（推荐）</Option>
                <Option value={3}>3次 - 宽松模式</Option>
                <Option value={4}>4次 - 非常宽松</Option>
              </Select>
            </Form.Item>

            <Form.Item>
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SearchOutlined />}
                  size="large"
                  loading={loading}
                >
                  生成名字
                </Button>
                <Button
                  icon={<RedoOutlined />}
                  onClick={handleReset}
                  size="large"
                >
                  重置
                </Button>
              </Space>
            </Form.Item>
          </Form>
        </Card>

        {results.length > 0 && (
          <Card title={`候选名字（共${results.length}个）`} className="results-section">
            <div className="name-list">
              {results.map((result, index) => (
                <Card
                  key={index}
                  className="name-card"
                  hoverable
                >
                  <div className="name-main">
                    <Title level={3} className="name-text">
                      {result.fullName}
                    </Title>
                    <div className="name-details">
                      <Space size="small" wrap>
                        <Tag color="blue">
                          {result.firstName}({result.firstChar.pinyin})
                        </Tag>
                        <Tag color="blue">
                          {result.secondName}({result.secondChar.pinyin})
                        </Tag>
                      </Space>
                    </div>
                  </div>

                  {/* 谐音匹配信息 - 高优先级显示 */}
                  {(() => {
                    const matches = matchHomophone(result.firstName, result.secondName);
                    if (matches.length > 0) {
                      return (
                        <>
                          <Divider style={{ margin: '12px 0' }} />
                          <div className="homophone-match">
                            <Text strong style={{ color: '#faad14' }}>
                              <StarFilled /> 典故出处：
                            </Text>
                            <div style={{ marginTop: '8px' }}>
                              {matches.map((match, idx) => (
                                <Card 
                                  key={idx} 
                                  size="small" 
                                  style={{ marginBottom: '8px', background: '#fffbe6', borderColor: '#ffe58f' }}
                                >
                                  <div>
                                    <Tag color="gold">{match.type === 'idiom' ? '成语' : match.type === 'poetry' ? '诗词' : '俗语'}</Tag>
                                    <Text strong>{match.phrase}</Text>
                                  </div>
                                  <div style={{ marginTop: '4px' }}>
                                    <Text type="secondary" style={{ fontSize: '12px' }}>
                                      出自：{match.source}
                                    </Text>
                                  </div>
                                  <div style={{ marginTop: '4px' }}>
                                    <Text style={{ fontSize: '12px' }}>
                                      寓意：{match.meaning}
                                    </Text>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          </div>
                        </>
                      );
                    }
                    return null;
                  })()}

                  <Divider style={{ margin: '12px 0' }} />

                  <div className="name-info">
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <div>
                        <Text strong>五行：</Text>
                        <Tag color="green">{result.firstChar.wuxing}</Tag>
                        <Tag color="green">{result.secondChar.wuxing}</Tag>
                      </div>
                      <div>
                        <Text strong>声调：</Text>
                        <Tag>{result.firstChar.tone}声</Tag>
                        <Tag>{result.secondChar.tone}声</Tag>
                        <Tag color="orange">{result.tonePattern}</Tag>
                      </div>
                      <div>
                        <Text strong>结构：</Text>
                        <Tag color="purple">{result.nameStructure}</Tag>
                      </div>
                      <div>
                        <Text strong>笔画：</Text>
                        <Text type="secondary">
                          {result.firstChar.simplified_strokes}画 + {result.secondChar.simplified_strokes}画 = {result.firstChar.simplified_strokes + result.secondChar.simplified_strokes}画
                        </Text>
                      </div>
                    </Space>
                  </div>

                  {result.auspiciousReferences.length > 0 && (
                    <>
                      <Divider style={{ margin: '12px 0' }} />
                      <div className="auspicious-ref">
                        <Text strong>吉祥参考：</Text>
                        <div className="phrase-tags">
                          {result.auspiciousReferences.map((phrase, idx) => (
                            <Tag key={idx} color="gold">
                              {phrase}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export default App;

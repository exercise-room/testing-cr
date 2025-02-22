import { OpenAI, AzureOpenAI } from 'openai';

export class Chat {
  private openai: OpenAI | AzureOpenAI;
  private isAzure: boolean;

  constructor(apikey: string) {
    this.isAzure = Boolean(
        process.env.AZURE_API_VERSION && process.env.AZURE_DEPLOYMENT,
    );

    if (this.isAzure) {
      // Azure OpenAI configuration
      this.openai = new AzureOpenAI({
        apiKey: apikey,
        endpoint: process.env.OPENAI_API_ENDPOINT || '',
        apiVersion: process.env.AZURE_API_VERSION || '',
        deployment: process.env.AZURE_DEPLOYMENT || '',
      });
    } else {
      // Standard OpenAI configuration
      this.openai = new OpenAI({
        apiKey: apikey,
        baseURL: process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1',
      });
    }
  }
  private getPRType(title: string): string {
    const lowerTitle = title.toLowerCase();
    
    if (lowerTitle.startsWith('error') || lowerTitle.startsWith('fix') || lowerTitle.startsWith('hotfix')) {
      return 'bugfix';
    } else if (lowerTitle.startsWith('feat')) {
      return 'feature';
    } else if (lowerTitle.startsWith('style')) {
      return 'style';
    } else if (lowerTitle.startsWith('build')) {
      return 'build';
    }
    return 'general';
  }

  private getReviewFocus(prType: string): string {
    const focusByType = {
      bugfix: `For this bug fix PR, pay special attention to:
- Root cause analysis of the bug
- Whether the fix addresses the core issue
- Potential side effects of the fix
- Error handling and edge cases
- Prevention of similar issues`,

      feature: `For this feature implementation PR, pay special attention to:
- Component structure and organization
- State management approach
- Code reusability and maintainability
- Performance considerations
- User interaction patterns`,

      style: `For this style-related PR, pay special attention to:
- Consistency with existing styles
- Component styling best practices
- Responsive design considerations
- CSS optimization
- Accessibility standards`,

      build: `For this build/configuration PR, pay special attention to:
- Build process impact
- Configuration changes
- Dependencies management
- Performance implications
- Development workflow effects`,

      general: `Please pay special attention to:
- Code quality and consistency
- Potential issues or bugs
- Performance considerations
- Best practices adherence
- Improvement suggestions`
    };

    return focusByType[prType] || focusByType.general;
  }

  private generatePrompt = (patch: string) => {
    const answerLanguage = process.env.LANGUAGE
        ? `Answer me in ${process.env.LANGUAGE},`
        : '';

    // const prompt =
    //     process.env.PROMPT ||
    //     'Below is a code patch, please help me do a brief code review on it. Any bug risks and/or improvement suggestions are welcome:';

    const prType = this.getPRType(prTitle);
    const reviewFocus = this.getReviewFocus(prType);


    // 1. 역할 정의와 PR 정보
    const roleAndContext = `You are an expert code reviewer specialized in Next.js 15 with TypeScript, focusing on frontend development.

Pull Request Title: "${prTitle}"
Type: ${prType}

Project Stack:
- Next.js 15 with TypeScript
- Component-based architecture
- Purpose: Warehouse Management System (WMS)`;

    // 2. 코딩 컨벤션
    const conventions = `Coding Conventions:
- Follow Next.js 15 app router conventions
- Maintain consistent component structure`;

    // 3. 추가 가이드라인 (있는 경우)
    const additionalGuidelines = process.env.PROMPT
      ? `\nAdditional Guidelines:\n${process.env.PROMPT}`
      : '';

    // 4. 리뷰 요청 (PR 타입별 포커스 + 구조화된 응답 형식)
    const reviewRequest = `${answerLanguage}

${reviewFocus}

Please provide a structured code review with the following sections:
1. Overview: Brief summary of the changes
2. Issues: Any problems or concerns found, considering the specific focus points above
3. Suggestions: Specific improvement recommendations
4. Good Points: What was done well, with detailed and generous praise

Here's the code to review:
${patch}`;

    // 모든 섹션을 순서대로 결합
    return `${roleAndContext}\n\n${conventions}${additionalGuidelines}\n\n${reviewRequest}`;
  };


  public codeReview = async (patch: string, context: any) => {
    if (!patch) {
      return '';
    }

    console.time('code-review cost');
    const prTitle = context.payload.pull_request.title || 'No title provided';
    const prompt = this.generatePrompt(patch, prTitle);

    const res = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: process.env.MODEL || 'gpt-3.5-turbo',
      temperature: +(process.env.temperature || 0) || 1,
      top_p: +(process.env.top_p || 0) || 1,
      max_tokens: process.env.max_tokens ? +process.env.max_tokens : undefined,
    });

    console.timeEnd('code-review cost');

    if (res.choices.length) {
      return res.choices[0].message.content;
    }

    return '';
  };
}

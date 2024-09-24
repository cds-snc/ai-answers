/* eslint-disable no-unused-vars */
/* eslint-disable import/no-unused-modules */
import React from 'react';
import TempChatAppContainer from './components/chat/TempChatAppContainer';
import { GcdsHeader} from '@cdssnc/gcds-components-react';
import { GcdsContainer} from '@cdssnc/gcds-components-react';
import '@cdssnc/gcds-components-react/gcds.css';

function App() {
  return (
    <div className="App">
      <header>
      <GcdsHeader
       langHref="#"
       skipToHref="#">
        <div slot="breadcrumb"><a href="https://www.canada.ca/en.html">Canada.ca</a><a href="https://www.canada.ca/en.html">AI</a></div>
      </GcdsHeader>
      </header>
      <main>
      <h1>AI Answers</h1>
      <GcdsContainer size="md" padding="100">
      <h2>Get answers to your Canada.ca questions. </h2>
			<p>To protect your privacy, names, numbers and addresses aren't accepted and will display as
				an <strong>X</strong>. Learn more
				at <a href="https://test.canada.ca/wayfinding-orientation-2023/ai/answers.html">About AI Answers</a>
			</p>  
      <details>
				<summary>Terms of use</summary>
				<p>We may store your questions to improve system performance. Any
					personal information you enter will be deleted upon detection and won’t be stored.</p>
				<p>Use the Canada.ca link provided in the response to check your answer. Responses generated by this AI system should not be considered as professional, legal, or medical
					advice. The information generated should be used at your own risk. We attempt to ensure the accuracy
					of the information provided but there is a possibility that the information may contain
					inaccuracies, and the information may not yet reflect recent changes or fulfill your particular
					needs or purposes.  </p>
				<p>This AI system relies on information provided at the Canada.ca website and your use of this system
					and any information generated is also subject to the <a
						href="https://www.canada.ca/en/transparency/terms.html">Canada.ca Terms and conditions.</a> </p>
			</details> 
      </GcdsContainer> 
      <TempChatAppContainer />
      </main>
    </div>
  );
}

export default App;


import { Wrapper } from "./components/Wrapper";
import { CertiChainDemo } from "./components/CertiChainDemo";

const Home = () => {
  return (
    <main className="py-8 md:py-10">
      <Wrapper>
        <CertiChainDemo />
      </Wrapper>
    </main>
  );
};

export default Home;
